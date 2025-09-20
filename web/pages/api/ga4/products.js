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

async function runReport(accessToken, propertyId, { startDate, endDate, metrics, dimensions, limit = 50 }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((m) => ({ name: m })),
    dimensions: dimensions.map((d) => ({ name: d })),
    limit,
    orderBys: [{ metric: { metricName: metrics[0] }, desc: true }],
  };

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

/**
 * Try a metric with itemId first; if incompatible, retry with itemName.
 * Returns { usedDimension: "itemId" | "itemName", rows: [{key, value, name?}] }
 */
async function tryMetricWithFallback(accessToken, propertyId, startDate, endDate, metric, limit) {
  // Attempt 1: itemId (plus itemName so we can display labels)
  try {
    const r = await runReport(accessToken, propertyId, {
      startDate,
      endDate,
      metrics: [metric],
      dimensions: ["itemId", "itemName"],
      limit,
    });
    return {
      usedDimension: "itemId",
      rows: (r.rows || []).map((row) => ({
        key: row.dimensionValues?.[0]?.value || "",      // itemId
        name: row.dimensionValues?.[1]?.value || "",      // itemName
        value: Number(row.metricValues?.[0]?.value || 0),
      })),
    };
  } catch (e) {
    // If it failed (incompatibility), try itemName only
    const r2 = await runReport(accessToken, propertyId, {
      startDate,
      endDate,
      metrics: [metric],
      dimensions: ["itemName"],
      limit,
    });
    return {
      usedDimension: "itemName",
      rows: (r2.rows || []).map((row) => ({
        key: row.dimensionValues?.[0]?.value || "",      // itemName
        name: row.dimensionValues?.[0]?.value || "",
        value: Number(row.metricValues?.[0]?.value || 0),
      })),
    };
  }
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
    // Run each metric in its own (compatible) report, with fallback between itemId/itemName
    const [viewsR, cartsR, purchasedR, revenueR] = await Promise.all([
      tryMetricWithFallback(ga.access_token, propertyId, startDate, endDate, "itemViews", limit),
      tryMetricWithFallback(ga.access_token, propertyId, startDate, endDate, "addToCarts", limit),
      tryMetricWithFallback(ga.access_token, propertyId, startDate, endDate, "itemPurchaseQuantity", limit),
      tryMetricWithFallback(ga.access_token, propertyId, startDate, endDate, "itemRevenue", limit),
    ]);

    // Decide which dimension we’ll present (prefer itemId if any of the calls used it)
    const usedDimension =
      [viewsR, cartsR, purchasedR, revenueR].some((r) => r.usedDimension === "itemId")
        ? "itemId"
        : "itemName";

    // Build a merged map keyed by the chosen dimension
    const map = new Map();

    function mergeRows(source, field) {
      for (const r of source.rows) {
        const key = r.key || r.name || "";
        if (!key) continue;
        if (!map.has(key)) map.set(key, { key, name: r.name || "", itemsViewed: 0, itemsAddedToCart: 0, itemsPurchased: 0, itemRevenue: 0 });
        map.get(key)[field] = (map.get(key)[field] || 0) + (r.value || 0);
        if (r.name && !map.get(key).name) map.get(key).name = r.name;
      }
    }

    mergeRows(viewsR, "itemsViewed");
    mergeRows(cartsR, "itemsAddedToCart");
    mergeRows(purchasedR, "itemsPurchased");
    mergeRows(revenueR, "itemRevenue");

    // Turn into array + decorate with id/name based on usedDimension
    const rows = Array.from(map.values()).map((r, i) => {
      if (usedDimension === "itemId") {
        return { id: r.key, name: r.name || "(unknown)", itemsViewed: r.itemsViewed, itemsAddedToCart: r.itemsAddedToCart, itemsPurchased: r.itemsPurchased, itemRevenue: r.itemRevenue };
      } else {
        return { id: "", name: r.name || r.key || `(row ${i + 1})`, itemsViewed: r.itemsViewed, itemsAddedToCart: r.itemsAddedToCart, itemsPurchased: r.itemsPurchased, itemRevenue: r.itemRevenue };
      }
    });

    // Sort by revenue desc (fallback to views)
    rows.sort((a, b) => (b.itemRevenue || 0) - (a.itemRevenue || 0) || (b.itemsViewed || 0) - (a.itemsViewed || 0));

    // Helpful note if nothing came back
    let note = "";
    if (rows.length === 0) {
      note =
        "No product rows returned for this date range. If GA’s E-commerce Purchases report shows items, make sure events include an items[] with item_id / item_name.";
    }

    return res.status(200).json({
      usedDimension,
      note,
      rows,
    });
  } catch (e) {
    const msg = e?.message || "Unknown error";
    return res.status(500).json({ error: `GA4 API error (products) — ${msg}`, details: e?.details || null });
  }
}
