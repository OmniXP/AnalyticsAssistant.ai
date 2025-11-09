// web/pages/api/ga4/inspect.js
// Dev helper: verifies bearer token and optionally pokes GA4 with a tiny report.

import * as session from "../../../lib/server/ga4-session";
export const config = { runtime: "nodejs" };

function normaliseProperty({ property, propertyId }) {
  if (property && /^properties\//.test(property)) return property;
  if (propertyId && String(propertyId).trim()) {
    const p = String(propertyId).trim();
    return p.startsWith("properties/") ? p : `properties/${p}`;
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const { token, sid, reason } = await session.getBearerForRequest(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "No bearer", sid: sid || null, reason: reason || null });
    }

    const prop = normaliseProperty(req.method === "POST" ? (req.body || {}) : (req.query || {}));

    // If no property provided, just return token status, cookie, and redirect info.
    if (!prop) {
      return res.status(200).json({
        ok: true,
        hasToken: true,
        sid: sid || null,
        note: "No property provided; pass { property: 'properties/123' } or { propertyId: '123' } to run a probe.",
      });
    }

    // Minimal probe to GA4 Data API.
    const url = `https://analyticsdata.googleapis.com/v1beta/${encodeURIComponent(prop)}:runReport`;
    const body = {
      dateRanges: [{ startDate: "2024-01-01", endDate: "2024-01-07" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      limit: 1,
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!resp.ok) {
      return res.status(resp.status).json({
        ok: false,
        error: "ga4_probe_failed",
        status: resp.status,
        details: json || text,
        request: { property: prop, body },
      });
    }

    res.status(200).json({
      ok: true,
      probe: {
        property: prop,
        rowCount: json?.rowCount ?? (json?.rows ? json.rows.length : 0),
        dimensionHeaders: json?.dimensionHeaders || [],
        metricHeaders: json?.metricHeaders || [],
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
