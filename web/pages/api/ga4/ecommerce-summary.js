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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  // GA4 Data API correct metric names:
  // - ecommercePurchases: count of purchases
  // - purchaseRevenue: total purchase revenue
  // - averagePurchaseRevenue: AOV (average order value)
  // - purchaserRate: % of users who purchased
  // - totalUsers, sessions for extra context
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "ecommercePurchases" },
      { name: "purchaseRevenue" },
      { name: "averagePurchaseRevenue" },
      { name: "purchaserRate" },
      { name: "totalUsers" },
      { name: "sessions" },
    ],
    // No dimensions -> a single totals row
  };

  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ga.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json().catch(() => null);
  if (!apiRes.ok) {
    // Bubble up GA4 error details so you can see what’s wrong from the UI
    return res.status(apiRes.status).json(data || { error: `GA4 error ${apiRes.status}` });
  }

  const row = (data.rows && data.rows[0]) || null;
  const mv = (i) => Number(row?.metricValues?.[i]?.value || 0);

  const purchases = mv(0);
  const revenue = mv(1);
  let aov = mv(2);
  const purchaseCvR = mv(3); // purchaserRate is already a percentage value (e.g. 3.45)
  const users = mv(4);
  const sessions = mv(5);

  // Fallback AOV if GA4 doesn't populate averagePurchaseRevenue
  if (!aov && purchases > 0 && revenue > 0) {
    aov = revenue / purchases;
  }

  return res.status(200).json({
    totals: {
      purchases,
      revenue,
      aov,
      purchaserRate: purchaseCvR,
      users,
      sessions,
      dateRange: { start: startDate, end: endDate },
    },
    raw: data,
  });
}
