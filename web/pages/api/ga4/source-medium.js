// /workspaces/insightsgpt/web/pages/api/ga4/source-medium.js
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

// Build a GA4 FilterExpression AND-group for optional Country + Channel Group
function buildDimensionFilter(filters) {
  const exprs = [];

  if (filters?.country && filters.country !== "All") {
    exprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { value: filters.country, matchType: "EXACT" },
      },
    });
  }

  if (filters?.channelGroup && filters.channelGroup !== "All") {
    exprs.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { value: filters.channelGroup, matchType: "EXACT" },
      },
    });
  }

  if (exprs.length === 0) return undefined;
  return { andGroup: { expressions: exprs } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  // Session / auth
  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) {
    return res.status(401).json({
      error: "No access token in session. Click 'Connect Google Analytics' then try again.",
    });
  }

  // Inputs
  const { propertyId, startDate, endDate, limit = 50, filters } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  // GA4 request
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "source" }, { name: "medium" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    limit: Math.min(Number(limit) || 50, 1000),
  };

  const dimensionFilter = buildDimensionFilter(filters);
  if (dimensionFilter) body.dimensionFilter = dimensionFilter;

  try {
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
      const msg = data?.error?.message || text || `HTTP ${apiRes.status}`;
      return res.status(apiRes.status).json({ error: msg, details: data || null });
    }

    return res.status(200).json(data || {});
  } catch (err) {
    return res.status(500).json({
      error: "GA4 API request failed (source-medium)",
      details: String(err?.message || err),
    });
  }
}
