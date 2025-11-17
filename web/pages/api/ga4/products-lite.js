// web/pages/api/ga4/products-lite.js
import { getBearerForRequest } from "../../../server/ga4-session.js";

function buildFilter(filters = {}) {
  const andFilter = [];
  if (filters.country && filters.country !== "All") {
    andFilter.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } } });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    andFilter.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } } });
  }
  return andFilter.length ? { andGroup: { expressions: andFilter } } : undefined;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { propertyId, startDate, endDate, filters = {}, limit = 100 } = req.body || {};
  if (!propertyId || !startDate || !endDate) return res.status(400).json({ ok: false, error: "Missing propertyId or date range" });

  try {
    const bearer = await getBearerForRequest(req);

    const payload = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [{ name: "itemViews" }, { name: "addToCarts" }, { name: "itemPurchaseQuantity" }, { name: "itemRevenue" }],
      orderBys: [{ metric: { metricName: "itemViews" }, desc: true }],
      limit: String(limit),
      ...(buildFilter(filters) ? { dimensionFilter: buildFilter(filters) } : {}),
    };

    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: json?.error?.message || `GA error ${resp.status}`, details: json });

    res.status(200).json(json);
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: status === 401 || status === 403 ? "No bearer" : e?.message || "Unexpected error" });
  }
}
