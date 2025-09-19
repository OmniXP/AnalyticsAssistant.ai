// web/pages/api/ga4/products.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax", path: "/" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "No access token in session." });

  const { propertyId, startDate, endDate, limit = 50 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  // Match GA UI “E-commerce purchases > Item name”:
  // Dimensions: itemName
  // Metrics: itemViews, addToCarts, itemsPurchased, itemRevenue
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "itemName" }],
    metrics: [
      { name: "itemViews" },
      { name: "addToCarts" },
      { name: "itemsPurchased" },   // GA4 Data API metric
      { name: "itemRevenue" }
    ],
    keepEmptyRows: true,
    limit,
    orderBys: [{ metric: { metricName: "itemViews" }, desc: true }],
    metricAggregations: ["TOTAL"],
  };

  const apiRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ga.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await apiRes.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!apiRes.ok) {
    return res.status(apiRes.status).json(data || { error: text || `HTTP ${apiRes.status}` });
  }
  return res.status(200).json(data || {});
}
