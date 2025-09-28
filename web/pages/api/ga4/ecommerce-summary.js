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
    // totals only: no dimensions (reduces incompatibility errors)
    metrics: metrics.map((name) => ({ name })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
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
    return res
      .status(400)
      .json({ error: "Missing propertyId/startDate/endDate", got: req.body || null });
  }

  // Set A (common)
  const METRICS_A = ["itemViewEvents", "addToCarts", "purchases", "itemRevenue"];
  // Set B (fallback on some properties)
  const METRICS_B = ["itemViewEvents", "addToCarts", "purchases", "purchaseRevenue"];

  // Attempt 1
  let attempt = await runReport({
    accessToken: ga.access_token,
    propertyId,
    startDate,
    endDate,
    metrics: METRICS_A,
  });

  // If incompatible, retry with Set B
  if (!attempt.ok && attempt.status === 400) {
    const msg = attempt?.data?.error?.message || "";
    const shouldRetry = /itemRevenue|dimensions & metrics are incompatible|invalid/i.test(msg);
    if (shouldRetry) {
      attempt = await runReport({
        accessToken: ga.access_token,
        propertyId,
        startDate,
        endDate,
        metrics: METRICS_B,
      });
    }
  }

  if (!attempt.ok) {
    return res.status(attempt.status).json({
      error: "GA4 API error (ecommerce-summary)",
      details: attempt.data || null,
    });
  }

  const mv = attempt?.data?.rows?.[0]?.metricValues || [];
  const [viewedRaw, addToCartRaw, purchasesRaw, revenueRaw] = mv;

  const totals = {
    itemsViewed: Number(viewedRaw?.value || 0),
    addToCarts: Number(addToCartRaw?.value || 0),
    purchases: Number(purchasesRaw?.value || 0),
    revenue: Number(revenueRaw?.value || 0),
  };

  return res.status(200).json({
    totals,
    dateRange: { start: startDate, end: endDate },
  });
}
