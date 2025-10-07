// /pages/api/ga4/products.js
// If your other GA4 routes import from a different path, copy that EXACT path here:
import { getAccessToken } from "../auth/google/token";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { propertyId, startDate, endDate, filters, limit = 50 } = req.body || {};
    if (!propertyId) return res.status(400).json({ error: "Missing propertyId" });

    // 1) Get OAuth token (same way as your working routes)
    const token = await getAccessToken();

    // 2) Apply global filters (country, channel group) if present
    const andFilters = [];
    if (filters?.country && filters.country !== "All") {
      andFilters.push({
        filter: {
          fieldName: "country",
          stringFilter: { matchType: "EXACT", value: filters.country },
        },
      });
    }
    if (filters?.channelGroup && filters.channelGroup !== "All") {
      andFilters.push({
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { matchType: "EXACT", value: filters.channelGroup },
        },
      });
    }
    const dimensionFilter =
      andFilters.length > 0 ? { andGroup: { expressions: andFilters } } : undefined;

    // 3) Build GA4 request
    // IMPORTANT:
    // - Avoid itemsViewed + addToCarts together; some properties flag them as incompatible.
    // - Use itemPurchaseQuantity (count of items bought) and itemRevenue (revenue per item).
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [
        { name: "addToCarts" },           // adds (compatible with item metrics)
        { name: "itemPurchaseQuantity" }, // purchased quantity
        { name: "itemRevenue" },          // revenue attributed to the item
      ],
      orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
      limit: String(limit),
      ...(dimensionFilter ? { dimensionFilter } : {}),
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const gaRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await gaRes.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // leave as text
    }

    if (!gaRes.ok) {
      const msg =
        data?.error?.message ||
        text ||
        "GA4 API error (products)";
      return res.status(400).json({ error: msg, details: data || null });
    }

    // 4) Normalize output for the frontend
    return res.status(200).json({
      dimensionHeaders: data?.dimensionHeaders || [],
      metricHeaders: data?.metricHeaders || [],
      rows: data?.rows || [],
      rowCount: data?.rowCount || 0,
      kind: "analyticsData#runReport",
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
