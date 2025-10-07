// /pages/api/ga4/products.js
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

  try {
    const { propertyId, startDate, endDate, limit = 50, filters } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    // Build an optional dimensionFilter from your global filters
    // (It's OK to filter on a dimension that isn't in 'dimensions' below.)
    const andConditions = [];
    if (filters?.country && filters.country !== "All") {
      andConditions.push({
        filter: {
          fieldName: "country",
          stringFilter: { value: String(filters.country), matchType: "EXACT" },
        },
      });
    }
    if (filters?.channelGroup && filters.channelGroup !== "All") {
      andConditions.push({
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { value: String(filters.channelGroup), matchType: "EXACT" },
        },
      });
    }

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemId" }, { name: "itemName" }],
      metrics: [
        { name: "itemsPurchased" },
        { name: "itemRevenue" },
      ],
      // Order by itemsPurchased desc, then revenue desc
      orderBys: [
        { metric: { metricName: "itemsPurchased" }, desc: true },
        { metric: { metricName: "itemRevenue" }, desc: true },
      ],
      limit: String(limit),
    };

    if (andConditions.length) {
      body.dimensionFilter = { andGroup: { expressions: andConditions } };
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await apiRes.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!apiRes.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        text ||
        `HTTP ${apiRes.status}`;
      return res.status(400).json({
        error: "GA4 API error (products)",
        details: data || { message: msg },
      });
    }

    return res.status(200).json(data || {});
  } catch (e) {
    return res.status(500).json({ error: "Server error (products)", message: String(e?.message || e) });
  }
}