// /pages/api/ga4/products.js
import { getAccessToken } from "../auth/google/token"; // adjust path if your token util lives elsewhere

// Small helpers to build GA4 filter expressions safely
function buildFilter(fieldName, value) {
  if (!value || value === "All") return null;
  // For channel group and country we match exact string
  return {
    filter: {
      fieldName,
      stringFilter: { matchType: "EXACT", value }
    }
  };
}

function mergeAndFilters(filters) {
  const andGroup = filters.filter(Boolean);
  if (!andGroup.length) return null;
  return { andGroup: { expressions: andGroup } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const {
      propertyId,
      startDate,
      endDate,
      filters = {},
      limit = 50,
    } = req.body || {};

    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const accessToken = await getAccessToken(); // your OAuth helper

    // IMPORTANT: use **item-scoped** dimensions and **compatible** metrics.
    // - dimensions: itemName, itemId
    // - metrics: itemsViewed, addToCarts, itemPurchaseQuantity, itemRevenue
    // These are all item-scoped and compatible with each other.
    const requestBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "itemName" },
        { name: "itemId" },
      ],
      metrics: [
        { name: "itemsViewed" },
        { name: "addToCarts" },
        { name: "itemPurchaseQuantity" },
        { name: "itemRevenue" },
      ],
      limit: Math.max(1, Math.min(5000, Number(limit) || 50)),
      orderBys: [
        { metric: { metricName: "itemRevenue" }, desc: true },
        { metric: { metricName: "itemPurchaseQuantity" }, desc: true },
      ],
    };

    // Apply optional filters (country / default channel group) if not "All"
    const countryExpr = buildFilter("country", filters.country);
    const chExpr = buildFilter("sessionDefaultChannelGroup", filters.channelGroup);
    const where = mergeAndFilters([countryExpr, chExpr]);
    if (where) requestBody.dimensionFilter = where;

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const gaRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const text = await gaRes.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!gaRes.ok) {
      return res.status(gaRes.status).json({
        error: "GA4 API error (products)",
        details: data || text || `HTTP ${gaRes.status}`
      });
    }

    // Return the GA4 payload directly; frontend will parse metric headers safely
    return res.status(200).json(data || {});
  } catch (e) {
    return res.status(500).json({ error: "Server error (products)", details: String(e?.message || e) });
  }
}