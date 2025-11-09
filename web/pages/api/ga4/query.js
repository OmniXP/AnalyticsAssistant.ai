// web/pages/api/ga4/query.js
import * as session from "../_core/ga4-session";
export const config = { runtime: "nodejs" };

const GA = "https://analyticsdata.googleapis.com/v1beta";

function toISO(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return toISO(d); }

// Build an AND filter for optional Country + Channel Group
function buildDimensionFilter(filters) {
  const exprs = [];
  const isAll = (v) => !v || String(v).trim().toLowerCase() === "all";

  if (filters?.country && !isAll(filters.country)) {
    exprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { value: String(filters.country), matchType: "EXACT" },
      },
    });
  }
  if (filters?.channelGroup && !isAll(filters.channelGroup)) {
    exprs.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { value: String(filters.channelGroup), matchType: "EXACT" },
      },
    });
  }
  if (!exprs.length) return undefined;
  return { andGroup: { expressions: exprs } };
}

// Presets used by the dashboard
function buildPreset({ preset, startDate, endDate, limit, filters }) {
  const dateRanges = [{ startDate, endDate }];
  const keepLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100000, limit)) : undefined;
  const dimensionFilter = buildDimensionFilter(filters);

  switch (preset) {
    case "channels":
      return {
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "purchaseRevenue" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };

    case "sourceMedium":
      return {
        dateRanges,
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };

    case "topPages":
      return {
        dateRanges,
        dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };

    case "ecomSummary":
      return {
        dateRanges,
        // No dimensions for totals
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "purchases" },
          { name: "purchaseRevenue" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 1,
      };

    case "timeseries":
      return {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "purchaseRevenue" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 1000,
      };

    default:
      // Safe default: channel summary
      return {
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 25,
      };
  }
}

function normaliseDates({ startDate, endDate, lastDays }) {
  if (startDate && endDate) return { startDate, endDate };
  const days = Number.isFinite(lastDays) ? lastDays : 28;
  return { startDate: daysAgo(days), endDate: daysAgo(0) };
}

function normaliseProperty({ property, propertyId }) {
  // Accept either; prefer property if provided
  let p = property || propertyId;
  if (!p) return null;
  p = String(p).trim();
  if (p.startsWith("properties/")) return p;
  // If only numeric id was provided, wrap it
  return `properties/${p}`;
}

async function runReport({ token, propertyPath, body }) {
  const url = `${GA}/${encodeURIComponent(propertyPath)}:runReport`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await resp.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  if (!resp.ok) {
    return { ok: false, status: resp.status, body: json || text };
  }
  return { ok: true, status: resp.status, body: json };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: "Not connected" });

    const {
      property,          // optional: 'properties/123'
      propertyId,        // optional: '123' (preferred by UI)
      preset = "channels",
      startDate,
      endDate,
      lastDays,
      limit,
      filters,           // optional: { country, channelGroup }
    } = req.body || {};

    const propertyPath = normaliseProperty({ property, propertyId });
    if (!propertyPath) {
      return res.status(400).json({ error: "No GA4 property selected or provided" });
    }

    const dates = normaliseDates({ startDate, endDate, lastDays });
    const body = buildPreset({
      preset,
      startDate: dates.startDate,
      endDate: dates.endDate,
      limit,
      filters,
    });

    const out = await runReport({ token, propertyPath, body });
    if (!out.ok) {
      // Surface GA error back up so the UI shows something actionable
      const gaMsg =
        out.body?.error?.message ||
        (typeof out.body === "string" ? out.body : "") ||
        `HTTP ${out.status}`;
      return res
        .status(out.status)
        .json({ error: "query_failed", message: gaMsg, request: { propertyPath, preset } });
    }

    res.status(200).json({
      ok: true,
      preset,
      property: propertyPath,
      dateRange: { startDate: dates.startDate, endDate: dates.endDate },
      dimensionHeaders: out.body.dimensionHeaders || [],
      metricHeaders: out.body.metricHeaders || [],
      rows: out.body.rows || [],
      total: out.body.rowCount ?? (out.body.rows ? out.body.rows.length : 0),
    });
  } catch (e) {
    res.status(500).json({ error: "query_exception", message: e?.message || String(e) });
  }
}
