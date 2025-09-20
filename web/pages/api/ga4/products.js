// /workspaces/insightsgpt/web/pages/api/ga4/products.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

async function runReport(accessToken, propertyId, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`GA4 API error — ${JSON.stringify(data)}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// views via eventCount filtered to view_item
async function fetchViews(accessToken, propertyId, startDate, endDate, limit) {
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "eventCount" }],
    dimensions: [{ name: "itemName" }, { name: "eventName" }],
    dimensionFilter: {
      filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "view_item" } },
    },
    limit,
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
  };
  const r = await runReport(accessToken, propertyId, body);
  const map = new Map();
  for (const row of r.rows || []) {
    const item = row.dimensionValues?.[0]?.value || "";
    const count = Number(row.metricValues?.[0]?.value || 0);
    if (!item) continue;
    map.set(item, (map.get(item) || 0) + count);
  }
  return map; // itemName -> views
}

// add_to_cart via eventCount
async function fetchAddToCarts(accessToken, propertyId, startDate, endDate, limit) {
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "eventCount" }],
    dimensions: [{ name: "itemName" }, { name: "eventName" }],
    dimensionFilter: {
      filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "add_to_cart" } },
    },
    limit,
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
  };
  const r = await runReport(accessToken, propertyId, body);
  const map = new Map();
  for (const row of r.rows || []) {
    const item = row.dimensionValues?.[0]?.value || "";
    const count = Number(row.metricValues?.[0]?.value || 0);
    if (!item) continue;
    map.set(item, (map.get(item) || 0) + count);
  }
  return map; // itemName -> add_to_carts
}

// purchases via itemPurchaseQuantity (item-scoped)
async function fetchPurchases(accessToken, propertyId, startDate, endDate, limit) {
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "itemPurchaseQuantity" }],
    dimensions: [{ name: "itemName" }],
    limit,
    orderBys: [{ metric: { metricName: "itemPurchaseQuantity" }, desc: true }],
  };
  const r = await runReport(accessToken, propertyId, body);
  const map = new Map();
  for (const row of r.rows || []) {
    const item = row.dimensionValues?.[0]?.value || "";
    const qty = Number(row.metricValues?.[0]?.value || 0);
    if (!item) continue;
    map.set(item, (map.get(item) || 0) + qty);
  }
  return map; // itemName -> itemPurchaseQuantity
}

// revenue via itemRevenue (item-scoped)
async function fetchRevenue(accessToken, propertyId, startDate, endDate, limit) {
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "itemRevenue" }],
    dimensions: [{ name: "itemName" }],
    limit,
    orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
  };
  const r = await runReport(accessToken, propertyId, body);
  const map = new Map();
  for (const row of r.rows || []) {
    const item = row.dimensionValues?.[0]?.value || "";
    const rev = Number(row.metricValues?.[0]?.value || 0);
    if (!item) continue;
    map.set(item, (map.get(item) || 0) + rev);
  }
  return map; // itemName -> revenue
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "No access token in session" });

  const { propertyId, startDate, endDate, limit = 50 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  try {
    const [viewsMap, cartsMap, purchasesMap, revenueMap] = await Promise.all([
      fetchViews(ga.access_token, propertyId, startDate, endDate, limit),
      fetchAddToCarts(ga.access_token, propertyId, startDate, endDate, limit),
      fetchPurchases(ga.access_token, propertyId, startDate, endDate, limit),
      fetchRevenue(ga.access_token, propertyId, startDate, endDate, limit),
    ]);

    // Merge keys (itemName) from all maps
    const keys = new Set([
      ...viewsMap.keys(),
      ...cartsMap.keys(),
      ...purchasesMap.keys(),
      ...revenueMap.keys(),
    ]);

    const rows = Array.from(keys).map((name, i) => ({
      id: "", // we’re keying by itemName
      name: name || `(row ${i + 1})`,
      itemsViewed: Number(viewsMap.get(name) || 0),
      itemsAddedToCart: Number(cartsMap.get(name) || 0),
      itemsPurchased: Number(purchasesMap.get(name) || 0),
      itemRevenue: Number(revenueMap.get(name) || 0),
    }));

    // Sort by revenue, then views
    rows.sort((a, b) => (b.itemRevenue || 0) - (a.itemRevenue || 0) || (b.itemsViewed || 0) - (a.itemsViewed || 0));

    let note = "";
    if (rows.length === 0) {
      note =
        "No product rows returned for this date range. If GA’s E-commerce Purchases report shows items, make sure events include an items[] with item_id / item_name.";
    }

    return res.status(200).json({ usedDimension: "itemName", note, rows });
  } catch (e) {
    const msg = e?.message || "Unknown error";
    return res.status(500).json({ error: `GA4 API error (products) — ${msg}`, details: e?.details || null });
  }
}
