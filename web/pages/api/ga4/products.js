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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).send("No access token in session. Connect first.");

  const { propertyId, startDate, endDate, limit = 50 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).send("Missing propertyId/startDate/endDate");
  }

  // Match GA "E-commerce purchases" item table:
  // Dimensions: itemName (ONLY — don't include itemId to avoid dropping rows when it's missing)
  // Metrics: itemViews, addToCarts, itemPurchaseQuantity, itemRevenue
  // keepEmptyRows: include rows with zero metrics
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "itemName" }], // single dimension to maximise row retention
    metrics: [
      { name: "itemViews" },
      { name: "addToCarts" },
      { name: "itemPurchaseQuantity" },
      { name: "itemRevenue" },
    ],
    orderBys: [{ metric: { metricName: "itemViews" }, desc: true }],
    keepEmptyRows: true,
    limit,
  };

  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ga.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const dataText = await apiRes.text(); // safer: handle non-JSON error bodies
  let data = null;
  try { data = dataText ? JSON.parse(dataText) : null; } catch {}
  if (!apiRes.ok) return res.status(apiRes.status).send(data || dataText || "GA4 error");

  return res.status(200).json(data || {});
}
