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
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) {
    return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });
  }

  try {
    const { propertyId, startDate, endDate, limit = 50 } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    // This matches GA’s “E-commerce purchases” item metrics
    // Metrics order MUST match your frontend mapping:
    //   0=itemViews, 1=addToCarts, 2=itemsPurchased, 3=itemRevenue
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }],
      metrics: [
        { name: "itemViews" },
        { name: "addToCarts" },
        { name: "itemsPurchased" },
        { name: "itemRevenue" },
      ],
      orderBys: [
        { metric: { metricName: "itemRevenue" }, desc: true }
      ],
      limit: String(limit),
      keepEmptyRows: false,
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
      // Surface the real GA error back to the UI
      return res.status(apiRes.status).json({
        error: "GA4 API error (products)",
        details: data || null,
      });
    }

    // Pass through raw GA response (frontend already parses and maps)
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: "Server error (products)",
      details: String(err?.message || err),
    });
  }
}
