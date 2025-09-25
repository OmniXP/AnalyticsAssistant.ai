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
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    // Totals only: NO dimensions
    metrics: [
      { name: "itemViewEvents" },
      { name: "addToCarts" },
      { name: "purchases" },
      { name: "itemRevenue" },
    ],
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
    return res
      .status(apiRes.status)
      .json({ error: "GA4 API error (ecommerce-summary)", details: data });
  }

  const mv = data?.rows?.[0]?.metricValues || [];
  const totals = {
    itemsViewed: Number(mv?.[0]?.value || 0),
    addToCarts: Number(mv?.[1]?.value || 0),
    purchases: Number(mv?.[2]?.value || 0),
    revenue: Number(mv?.[3]?.value || 0),
  };

  return res.status(200).json({
    totals,
    dateRange: { start: startDate, end: endDate },
  });
}
