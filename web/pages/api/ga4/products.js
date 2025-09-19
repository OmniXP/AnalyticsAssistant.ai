import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax", path: "/" },
};

async function runReport({ accessToken, propertyId, body }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  if (!resp.ok) throw new Error(json?.error?.message || text || `HTTP ${resp.status}`);
  return json;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });

  const { propertyId, startDate, endDate, limit = 10 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const accessToken = ga.access_token;

  try {
    // 1) Try itemName + itemId
    const baseMetrics = [
      { name: "itemsViewed" },
      { name: "itemsAddedToCart" },
      { name: "itemsPurchased" },
      { name: "itemRevenue" },
    ];

    const byName = await runReport({
      accessToken,
      propertyId,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "itemName" }, { name: "itemId" }],
        metrics: baseMetrics,
        orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
        limit,
      },
    });

    if ((byName.rowCount || 0) > 0) {
      return res.status(200).json({ ...byName, diagnostics: { mode: "itemName+itemId" } });
    }

    // 2) Fallback: try by itemId only
    const byId = await runReport({
      accessToken,
      propertyId,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "itemId" }],
        metrics: baseMetrics,
        orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
        limit,
      },
    });

    if ((byId.rowCount || 0) > 0) {
      return res.status(200).json({ ...byId, diagnostics: { mode: "itemId_only" } });
    }

    // 3) Totals only (no dimension) — tells us if there’s any item activity at all
    const totalsOnly = await runReport({
      accessToken,
      propertyId,
      body: {
        dateRanges: [{ startDate, endDate }],
        metrics: baseMetrics,
      },
    });

    const totals = {
      itemsViewed: Number(totalsOnly?.rows?.[0]?.metricValues?.[0]?.value || 0),
      itemsAddedToCart: Number(totalsOnly?.rows?.[0]?.metricValues?.[1]?.value || 0),
      itemsPurchased: Number(totalsOnly?.rows?.[0]?.metricValues?.[2]?.value || 0),
      itemRevenue: Number(totalsOnly?.rows?.[0]?.metricValues?.[3]?.value || 0),
    };

    return res.status(200).json({
      rows: [],
      rowCount: 0,
      diagnostics: { mode: "totals_only", totals },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
