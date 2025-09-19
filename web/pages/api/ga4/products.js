// web/pages/api/ga4/products.js
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
  if (!ga?.access_token) return res.status(401).send("No access token in session");

  const { propertyId, startDate, endDate } = req.body || {};
  const limit = Math.min(Number(req.body?.limit) || 10, 50);

  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  // --- 1) Try item-level breakdown (prefer itemsViewed so we get rows even with 0 purchases) ---
  const breakdownBody = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "itemName" }, { name: "itemId" }],
    metrics: [
      { name: "itemsViewed" },
      { name: "itemsAddedToCart" },
      { name: "itemsPurchased" },
      { name: "itemRevenue" },
    ],
    orderBys: [{ metric: { metricName: "itemsViewed" }, desc: true }],
    limit,
  };

  const baseUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const doReport = async (body) => {
    const r = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) throw new Error(json?.error?.message || text || `HTTP ${r.status}`);
    return json || {};
  };

  try {
    const breakdown = await doReport(breakdownBody);

    if (Array.isArray(breakdown.rows) && breakdown.rows.length > 0) {
      // We succeeded: return item rows
      return res.status(200).json({
        rows: breakdown.rows,
        diagnostics: { mode: "ok", hint: "item breakdown via itemName+itemId" },
      });
    }

    // --- 2) No rows? Ask for totals (no dimensions) so we can still show context/diagnostics ---
    const totalsBody = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "itemsViewed" },
        { name: "itemsAddedToCart" },
        { name: "itemsPurchased" },
        { name: "itemRevenue" },
      ],
    };

    const totals = await doReport(totalsBody);

    const totalValues = totals?.rows?.[0]?.metricValues || [];
    const totalsObj = {
      itemsViewed: Number(totalValues?.[0]?.value || 0),
      itemsAddedToCart: Number(totalValues?.[1]?.value || 0),
      itemsPurchased: Number(totalValues?.[2]?.value || 0),
      itemRevenue: Number(totalValues?.[3]?.value || 0),
    };

    return res.status(200).json({
      rows: [],
      diagnostics: { mode: "totals_only", totals: totalsObj },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
