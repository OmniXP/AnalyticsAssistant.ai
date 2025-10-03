// pages/api/ga4/landing-pages.js
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

// Build a GA4 dimensionFilter from our UI filters
function buildGa4Filter(filters) {
  const ands = [];

  if (filters?.country && filters.country !== "All") {
    ands.push({
      filter: {
        fieldName: "country",
        stringFilter: { value: filters.country, matchType: "EXACT" },
      },
    });
  }

  if (filters?.channelGroup && filters.channelGroup !== "All") {
    ands.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { value: filters.channelGroup, matchType: "EXACT" },
      },
    });
  }

  if (!ands.length) return undefined;
  return { andGroup: { expressions: ands } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    // keep the 405 pattern you’re using elsewhere
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) {
      return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });
    }

    const {
      propertyId,
      startDate,
      endDate,
      filters,
      limit = 50,
    } = req.body || {};

    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    // IMPORTANT: use GA4-compatible metrics (no 'purchases'; use 'transactions' & 'purchaseRevenue')
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "landingPagePlusQueryString" },
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "transactions" },
        { name: "purchaseRevenue" },
      ],
      dimensionFilter: buildGa4Filter(filters),
      // keep ordering simple: most sessions first
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(limit),
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
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({
        error: "GA4 API error (landing-pages)",
        details: data || text || `HTTP ${apiRes.status}`,
      });
    }

    return res.status(200).json(data || {});
  } catch (err) {
    return res.status(500).json({ error: "Server error (landing-pages)", details: String(err?.message || err) });
  }
}
