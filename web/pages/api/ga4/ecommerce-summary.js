// /workspaces/insightsgpt/web/pages/api/ga4/ecommerce-summary.js
import { getIronSession } from "iron-session";
import { buildDimensionFilter } from "../../../lib/ga4";

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
  if (!ga?.access_token) return res.status(401).send("Not connected");

  const { propertyId, startDate, endDate, filters } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "addToCarts" },
      { name: "transactions" },
      { name: "purchaseRevenue" },
    ],
    // no dimensions → totals only
  };

  const df = buildDimensionFilter(filters);
  if (df) body.dimensionFilter = df;

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
    return res.status(apiRes.status).json({
      error: "GA4 API error (ecommerce-summary)",
      details: data || null,
    });
  }

  // Normalise totals
  const mv = (idx) => {
    try { return Number(data?.rows?.[0]?.metricValues?.[idx]?.value || 0); } catch { return 0; }
  };
  const totals = {
    addToCarts: mv(0),
    transactions: mv(1),
    purchaseRevenue: mv(2),
  };

  return res.status(200).json({ totals, dateRange: { start: startDate, end: endDate } });
}
