// /pages/api/ga4/products-lite.js
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const { propertyId, startDate, endDate, limit } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [{ name: "itemViews" }, { name: "addToCarts" }],
      orderBys: [{ desc: true, metric: { metricName: "itemViews" } }],
      limit: Math.min(Number(limit || 100), 1000),
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);

    if (!r.ok) {
      return res.status(r.status).json({
        error: "GA4 API error (products-lite)",
        details: data,
      });
    }

    const rows = (data.rows || []).map((row) => ({
      name: row.dimensionValues?.[0]?.value || "(unknown)",
      id: row.dimensionValues?.[1]?.value || "",
      itemViews: Number(row.metricValues?.[0]?.value || 0),
      addToCarts: Number(row.metricValues?.[1]?.value || 0),
      itemsPurchased: null, // not in lite
      itemRevenue: null,    // not in lite
    }));

    return res.status(200).json({ rows, debug: { body, data } });
  } catch (e) {
    return res.status(500).json({ error: "Server error (products-lite)", message: String(e) });
  }
}
