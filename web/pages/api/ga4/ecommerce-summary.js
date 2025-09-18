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
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).send("No access token in session");

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).send("Missing propertyId/startDate/endDate");
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    // No dimensions -> one aggregated row
    metrics: [
      { name: "purchaseRevenue" },
      { name: "transactions" },   // GA4 “purchases”
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "adImpressions" },
      { name: "adClicks" },
    ],
    // Also fine without metricAggregations since there’s no dimension,
    // but leaving this here doesn’t hurt if you ever add dimensions later.
    metricAggregations: ["TOTAL"],
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
  if (!apiRes.ok) return res.status(apiRes.status).json(data || { error: "GA4 error" });

  const row = data?.rows?.[0];
  const mv = row?.metricValues || [];

  const totals = {
    purchaseRevenue: Number(mv[0]?.value || 0),
    purchases:       Number(mv[1]?.value || 0), // “transactions” in GA4 API
    sessions:        Number(mv[2]?.value || 0),
    activeUsers:     Number(mv[3]?.value || 0),
    adImpressions:   Number(mv[4]?.value || 0),
    adClicks:        Number(mv[5]?.value || 0),
    currencyCode:    data?.metadata?.currencyCode || "GBP",
  };

  return res.status(200).json({ totals });
}
