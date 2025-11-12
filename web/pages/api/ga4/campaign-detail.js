// web/pages/api/ga4/campaign-detail.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

function baseFilter(filters = {}) {
  const andFilter = [];
  if (filters.country && filters.country !== "All") {
    andFilter.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } } });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    andFilter.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } } });
  }
  return andFilter;
}
function withCampaign(filters, campaign) {
  const andFilter = baseFilter(filters);
  if (campaign) {
    andFilter.push({ filter: { fieldName: "campaign", stringFilter: { matchType: "EXACT", value: String(campaign) } } });
  }
  return andFilter.length ? { andGroup: { expressions: andFilter } } : undefined;
}

async function runReport(bearer, propertyId, payload) {
  const resp = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw Object.assign(new Error(json?.error?.message || `GA error ${resp.status}`), { status: resp.status, details: json });
  return json;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { propertyId, startDate, endDate, filters = {}, campaign, limit = 50 } = req.body || {};
  if (!propertyId || !startDate || !endDate || !campaign) return res.status(400).json({ ok: false, error: "Missing propertyId/date range/campaign" });

  try {
    const bearer = await getBearerForRequest(req, res);

    // Totals for campaign
    const totals = await runReport(bearer, propertyId, {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }, { name: "totalRevenue" }],
      ...(withCampaign(filters, campaign) ? { dimensionFilter: withCampaign(filters, campaign) } : {}),
    });

    // Source / Medium breakdown
    const sourceMedium = await runReport(bearer, propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "source" }, { name: "medium" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }, { name: "totalRevenue" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
      ...(withCampaign(filters, campaign) ? { dimensionFilter: withCampaign(filters, campaign) } : {}),
    });

    // Ad content
    const adContent = await runReport(bearer, propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionManualAdContent" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }, { name: "totalRevenue" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
      ...(withCampaign(filters, campaign) ? { dimensionFilter: withCampaign(filters, campaign) } : {}),
    });

    // Term
    const term = await runReport(bearer, propertyId, {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionManualTerm" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }, { name: "totalRevenue" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
      ...(withCampaign(filters, campaign) ? { dimensionFilter: withCampaign(filters, campaign) } : {}),
    });

    res.status(200).json({ ok: true, totals, sourceMedium, adContent, term });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: status === 401 || status === 403 ? "No bearer" : e?.message || "Unexpected error", details: e?.details });
  }
}
