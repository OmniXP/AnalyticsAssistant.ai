// /workspaces/insightsgpt/web/pages/api/ga4/ecommerce-summary.js
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

async function runReport({ accessToken, propertyId, startDate, endDate, metrics }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    // totals only (no dimensions) to reduce compatibility issues
    metrics: metrics.map((name) => ({ name })),
    limit: 1,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) {
    return res.status(401).json({ error: "Not connected" });
  }

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({
      error: "Missing propertyId/startDate/endDate",
      got: req.body || null,
    });
  }

  // Try several metric sets (some properties don’t support all)
  const METRIC_SETS = [
    // Preferred: transactions + revenue (GA4 supports "transactions")
    ["itemViewEvents", "addToCarts", "transactions", "purchaseRevenue"],
    // Fallback: itemPurchaseQuantity (quantity of items purchased) + revenue
    ["itemViewEvents", "addToCarts", "itemPurchaseQuantity", "purchaseRevenue"],
    // Fallback: purchaserRate + revenue (rate of users who purchased)
    ["itemViewEvents", "addToCarts", "purchaserRate", "purchaseRevenue"],
    // Minimal fallback: revenue only
    ["purchaseRevenue"],
  ];

  let attempt = null;
  for (const set of METRIC_SETS) {
    attempt = await runReport({
      accessToken: ga.access_token,
      propertyId,
      startDate,
      endDate,
      metrics: set,
    });

    // Accept 200s only; if 400 (invalid combo), try next set; else stop.
    if (attempt.ok) break;
    if (attempt.status !== 400) break;
  }

  if (!attempt?.ok) {
    return res.status(attempt?.status || 500).json({
      error: "GA4 API error (ecommerce-summary)",
      details: attempt?.data || null,
    });
  }

  const mv = attempt?.data?.rows?.[0]?.metricValues || [];
  // Build a map metricName -> value string, based on the header order
  const headers = (attempt?.data?.metricHeaders || []).map((h) => h.name);
  const metricMap = {};
  headers.forEach((name, i) => {
    metricMap[name] = Number(mv?.[i]?.value || 0);
  });

  // Normalize into a single totals object; fields may be 0 if not returned
  const totals = {
    itemsViewed: metricMap.itemViewEvents ?? 0,
    addToCarts: metricMap.addToCarts ?? 0,

    // One of these may exist (priority order):
    transactions: metricMap.transactions ?? 0,                // count of orders
    itemPurchaseQuantity: metricMap.itemPurchaseQuantity ?? 0, // total items purchased

    // Purchaser rate (percent of users who purchased in period) if present
    purchaserRate: metricMap.purchaserRate ?? null,

    // Revenue (always numeric, defaults 0)
    revenue: metricMap.purchaseRevenue ?? 0,
  };

  return res.status(200).json({
    totals,
    dateRange: { start: startDate, end: endDate },
  });
}
