// web/pages/api/ga4/campaign-detail.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

function buildCommonFilter(filters = {}, campaign) {
  const exprs = [];
  if (campaign) {
    exprs.push({ filter: { fieldName: "campaign", stringFilter: { matchType: "EXACT", value: String(campaign) } } });
  }
  if (filters.country && filters.country !== "All") {
    exprs.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } } });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    exprs.push({ filter: { fieldName: "defaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } } });
  }
  if (!exprs.length) return undefined;
  return { andGroup: { expressions: exprs } };
}

async function run(propertyId, bearer, body) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json?.error?.message || "GA4 error");
  return json;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
  try {
    const { bearer, error } = await getBearerForRequest(req);
    if (error || !bearer) return res.status(401).json({ ok: false, error: error || "No bearer" });

    const { propertyId, startDate, endDate, filters = {}, campaign, limit = 50 } = req.body || {};
    if (!propertyId) return res.status(400).json({ ok: false, error: "Missing propertyId" });
    if (!campaign) return res.status(400).json({ ok: false, error: "Missing campaign" });

    const commonFilter = buildCommonFilter(filters, campaign);

    // Totals
    const totals = await run(propertyId, bearer, {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      dimensionFilter: commonFilter,
    });

    // By source/medium
    const sourceMedium = await run(propertyId, bearer, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "source" }, { name: "medium" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      orderBys: [{ metric: { metricName: "purchaseRevenue" }, desc: true }],
      limit: String(limit),
      dimensionFilter: commonFilter,
    });

    // By ad content
    const adContent = await run(propertyId, bearer, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "adContent" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      orderBys: [{ metric: { metricName: "purchaseRevenue" }, desc: true }],
      limit: String(limit),
      dimensionFilter: commonFilter,
    });

    // By term
    const term = await run(propertyId, bearer, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "term" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }],
      orderBys: [{ metric: { metricName: "purchaseRevenue" }, desc: true }],
      limit: String(limit),
      dimensionFilter: commonFilter,
    });

    return res.status(200).json({ ok: true, totals, sourceMedium, adContent, term });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
