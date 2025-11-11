// web/pages/api/ga4/timeseries.js
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

    const { propertyId, startDate, endDate, filters, granularity = "daily" } = req.body || {};
    if (!propertyId) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    const periodDim = granularity === "weekly" ? "yearWeek" : "date";

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: periodDim }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      orderBys: [{ dimension: { dimensionName: periodDim }, desc: false }],
      limit: "10000",
      dimensionFilter: buildDimFilter(filters),
    };

    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: json?.error?.message || "GA4 error" });

    const series = (json.rows || []).map((row) => ({
      period: row.dimensionValues?.[0]?.value || "",
      sessions: Number(row.metricValues?.[0]?.value || 0),
      users: Number(row.metricValues?.[1]?.value || 0),
      transactions: Number(row.metricValues?.[2]?.value || 0),
      revenue: Number(row.metricValues?.[3]?.value || 0),
    }));

    return res.status(200).json({ ok: true, series });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
