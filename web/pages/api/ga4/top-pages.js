// web/pages/api/ga4/top-pages.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

function buildDimFilter(filters = {}) {
  const exprs = [];
  if (filters.country && filters.country !== "All") {
    exprs.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } } });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    exprs.push({ filter: { fieldName: "defaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } } });
  }
  if (!exprs.length) return undefined;
  return { andGroup: { expressions: exprs } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
  try {
    const { bearer, error } = await getBearerForRequest(req);
    if (error || !bearer) return res.status(401).json({ ok: false, error: error || "No bearer" });

    const { propertyId, startDate, endDate, filters, limit = 20 } = req.body || {};
    if (!propertyId) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    // Use pageTitle + pagePath with views + users
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pageTitle" }, { name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: String(limit),
      dimensionFilter: buildDimFilter(filters),
    };

    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: json?.error?.message || "GA4 error" });
    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
