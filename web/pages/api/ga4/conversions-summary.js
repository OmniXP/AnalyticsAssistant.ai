// /workspaces/insightsgpt/web/pages/api/ga4/conversions-summary.js
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

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    // Solid GA4 metrics for “goals & conversions”
    metrics: [
      { name: "conversions" },           // total conversions (all conversion events)
      { name: "userConversionRate" },    // % of users who converted
      { name: "totalUsers" },
      { name: "sessions" },
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

  const text = await apiRes.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}

  if (!apiRes.ok) {
    const msg = data?.error?.message || text || `HTTP ${apiRes.status}`;
    return res.status(apiRes.status).json({ error: msg });
  }

  const row = data?.rows?.[0];
  const mv = (i) => Number(row?.metricValues?.[i]?.value || 0);

  const totals = {
    conversions: mv(0),
    userConversionRate: mv(1), // already a percentage value
    users: mv(2),
    sessions: mv(3),
    dateRange: { start: startDate, end: endDate },
  };

  return res.status(200).json({ totals, raw: data });
}
