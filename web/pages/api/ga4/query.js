// web/pages/api/ga4/query.js
// Single GA4 Data API entry-point with sensible presets.
// Accepts either { property: "properties/123" } or { propertyId: "123" }.

import * as session from "../../../lib/server/ga4-session";
export const config = { runtime: "nodejs" };

const GA = "https://analyticsdata.googleapis.com/v1beta";

function toISO(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return toISO(d); }

function normaliseProperty(input) {
  const { property, propertyId } = input || {};
  if (property && String(property).startsWith("properties/")) return String(property);
  if (propertyId != null && String(propertyId).trim() !== "") {
    const p = String(propertyId).trim();
    return p.startsWith("properties/") ? p : `properties/${p}`;
  }
  return null;
}

// Build a report request for common presets.
// IMPORTANT: order of dimensions is what your UI will index into.
function buildPreset({ preset, startDate, endDate, limit }) {
  const dateRange = [{ startDate, endDate }];
  const keepLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100000, limit)) : undefined;

  switch (preset) {
    case "channels": {
      return {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "purchaseRevenue" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: keepLimit || 50,
      };
    }
    case "sourceMedium": {
      return {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "purchaseRevenue" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: keepLimit || 50,
      };
    }
    case "topPages": {
      return {
        dateRanges: dateRange,
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "totalUsers" },
          { name: "sessions" },
          { name: "engagedSessions" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: keepLimit || 50,
      };
    }
    case "ecomSummary": {
      return {
        dateRanges: dateRange,
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
        limit: keepLimit || 1,
      };
    }
    case "timeseries": {
      return {
        dateRanges: dateRange,
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "conversions" },
          { name: "purchaseRevenue" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
        limit: keepLimit || 1000,
      };
    }
    default: {
      return {
        dateRanges: dateRange,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: keepLimit || 25,
      };
    }
  }
}

function normalizeDates({ startDate, endDate, lastDays }) {
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
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    return { ok: false, status: resp.status, body: json || text };
  }
  return { ok: true, status: resp.status, body: json };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: "Not connected" });

    const {
      property, propertyId,       // either is fine
      preset = "channels",        // 'channels' | 'sourceMedium' | 'topPages' | 'ecomSummary' | 'timeseries'
      startDate, endDate,         // optional explicit
      lastDays,                   // optional; default 28
      limit,                      // optional
      filters,                    // optional GA4 dimensionFilter object (advanced use)
    } = (req.body || {});

    const chosenProperty = normaliseProperty({ property, propertyId });
    if (!chosenProperty) {
      return res.status(400).json({ error: "No GA4 property selected or provided" });
    }

    const dates = normalizeDates({ startDate, endDate, lastDays });
    const body = buildPreset({ preset, startDate: dates.startDate, endDate: dates.endDate, limit });

    // pass through dimensionFilter if provided by advanced callers
    if (filters && typeof filters === "object") {
      body.dimensionFilter = filters;
    }

    const out = await runReport({ token, property: chosenProperty, body });
    if (!out.ok) {
      return res
        .status(out.status)
        .json({ error: "query_failed", details: out.body, request: { property: chosenProperty, preset, body } });
    }

    res.status(200).json({
      ok: true,
      preset,
      property: chosenProperty,
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
