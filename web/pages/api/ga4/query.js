// web/pages/api/ga4/query.js
// Opinionated GA4 query for "Traffic by Default Channel Group" plus filters/date range.
// Accepts { propertyId, startDate, endDate, filters }.

import { getBearerForRequest } from "../../../lib/server/ga4-session";

function normalisePropertyId(input) {
  if (!input) return null;
  const s = String(input);
  return s.startsWith("properties/") ? s.slice("properties/".length) : s;
}

function buildFilterExpression(filters) {
  // Maps { country: "...", channelGroup: "..." } to a GA4 FilterExpression
  const parts = [];
  if (filters?.country && filters.country !== "All") {
    parts.push({
      filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } },
    });
  }
  if (filters?.channelGroup && filters.channelGroup !== "All") {
    parts.push({
      filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } },
    });
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { andGroup: { expressions: parts } };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ error: "No bearer" });

    const { propertyId, startDate, endDate, filters } = req.body || {};
    const pid = normalisePropertyId(propertyId);
    if (!pid) return res.status(400).json({ error: "Missing propertyId" });
    if (!startDate || !endDate) return res.status(400).json({ error: "Missing date range" });

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;

    const body = {
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      dateRanges: [{ startDate: String(startDate), endDate: String(endDate) }],
      keepEmptyRows: false,
    };

    const filterExp = buildFilterExpression(filters);
    if (filterExp) body.dimensionFilter = filterExp;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Surface GA error message cleanly for the UI
      const msg = j?.error?.message || "query_failed";
      return res.status(r.status).json({ error: msg, details: j });
    }

    res.status(200).json(j);
  } catch (e) {
    res.status(500).json({ error: "query_failed", message: String(e?.message || e) });
  }
}
