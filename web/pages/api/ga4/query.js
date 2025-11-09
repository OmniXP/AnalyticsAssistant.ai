// web/pages/api/ga4/query.js
// Hardened: accepts propertyId OR property, consistent presets, detailed GA errors.
import * as session from "../_core/ga4-session";

export const config = { runtime: "nodejs" };

const GA = "https://analyticsdata.googleapis.com/v1beta";

function toISO(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return toISO(d); }

function normaliseProperty(p) {
  if (!p) return null;
  const s = String(p).trim();
  if (!s) return null;
  return s.startsWith("properties/") ? s : `properties/${s}`;
}

function buildPreset({ preset, startDate, endDate, limit }) {
  const dateRanges = [{ startDate, endDate }];
  const lim = Number.isFinite(limit) ? Math.max(1, Math.min(100000, limit)) : undefined;

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
        limit: lim || 50,
      };

    case "sourceMedium":
      return {
        dateRanges,
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: lim || 50,
      };

    case "topPages":
      return {
        dateRanges,
        dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: lim || 50,
      };

    case "ecomKpis":
    case "ecomSummary":
      return {
        dateRanges,
        // No dimensions to avoid item-level metric incompatibilities
        dimensions: [],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "purchases" },
          { name: "purchaseRevenue" },
          { name: "averagePurchaseRevenue" },
          { name: "purchaserConversionRate" },
        ],
        limit: lim || 1,
      };

    case "timeseries":
      return {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }, { name: "purchaseRevenue" }],
        orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
        limit: lim || 1000,
      };

    default:
      return {
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: lim || 25,
      };
  }
}

function normaliseDates({ startDate, endDate, lastDays }) {
  if (startDate && endDate) return { startDate, endDate };
  const days = Number.isFinite(lastDays) ? lastDays : 28;
  return { startDate: daysAgo(days), endDate: daysAgo(0) };
}

async function runReport({ token, property, body }) {
  const url = `${GA}/${encodeURIComponent(property)}:runReport`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await resp.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}

  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      gaError: json?.error || json || text || `HTTP ${resp.status}`,
      gaBody: json,
    };
  }
  return { ok: true, status: resp.status, body: json };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: "Not connected" });

    const {
      propertyId,              // "123"
      property,                // "properties/123"
      preset = "channels",
      startDate, endDate,
      lastDays,
      limit,
      filters,                 // passthrough; your downstream panels handle it
    } = (typeof req.body === "object" ? req.body : {}) || {};

    const chosenProperty = normaliseProperty(property || propertyId);
    if (!chosenProperty) {
      return res.status(400).json({ error: "No GA4 property selected or provided" });
    }

    const dates = normaliseDates({ startDate, endDate, lastDays });
    const body = buildPreset({ preset, startDate: dates.startDate, endDate: dates.endDate, limit });

    const out = await runReport({ token, property: chosenProperty, body });
    if (!out.ok) {
      return res.status(out.status).json({
        error: "query_failed",
        preset,
        property: chosenProperty,
        requestBody: body,
        details: out.gaError,     // <- expose GA’s real message
      });
    }

    return res.status(200).json({
      ok: true,
      preset,
      property: chosenProperty,
      dateRange: { startDate: dates.startDate, endDate: dates.endDate },
      dimensionHeaders: out.body.dimensionHeaders || [],
      metricHeaders: out.body.metricHeaders || [],
      rows: out.body.rows || [],
      total: out.body.rowCount ?? (out.body.rows ? out.body.rows.length : 0),
      filters: filters || null,
    });
  } catch (e) {
    return res.status(500).json({ error: "query_exception", message: e?.message || String(e) });
  }
}
