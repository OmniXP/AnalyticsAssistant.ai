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
  if (!ga?.access_token) return res.status(401).send("Not connected");

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).send("Missing propertyId/startDate/endDate");
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "purchases" },
      { name: "purchaseRevenue" },
    ],
    // no dimensions — we only need totals
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
    // surface a readable message
    const msg = data?.error?.message || text || `HTTP ${apiRes.status}`;
    return res.status(apiRes.status).json({ error: msg });
  }

  // Parse totals from a single total row (no dimensions requested)
  const m = data?.rows?.[0]?.metricValues || [];
  const totals = {
    sessions: Number(m?.[0]?.value || 0),
    activeUsers: Number(m?.[1]?.value || 0),
    purchases: Number(m?.[2]?.value || 0),
    purchaseRevenue: Number(m?.[3]?.value || 0),
    currencyCode: data?.metadata?.currencyCode || "GBP",
  };

  return res.status(200).json({ totals, raw: data });
}
