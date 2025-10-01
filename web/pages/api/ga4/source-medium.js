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

// Build GA4 FilterExpression (AND) for optional Country + Channel Group
function buildDimensionFilter(filters) {
  const exprs = [];

  // Country filter (exact match)
  if (filters?.country && filters.country !== "All") {
    exprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { value: filters.country, matchType: "EXACT" },
      },
    });
  }

  // Channel Group filter (exact match)
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

  // Use session-scoped dimensions for session metrics
  const requestBody = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    limit: Math.min(Number(limit) || 50, 1000),
    orderBys: [
      { desc: true, metric: { metricName: "sessions" } },
      { desc: true, metric: { metricName: "totalUsers" } },
    ],
  };

  const dimensionFilter = buildDimensionFilter(filters);
  if (dimensionFilter) requestBody.dimensionFilter = dimensionFilter;

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  try {
    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const text = await apiRes.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}

    if (!apiRes.ok) {
      const msg = data?.error?.message || text || `HTTP ${apiRes.status}`;
      return res.status(apiRes.status).json({ error: msg, details: data || null });
    }

    // If no rows, return 200 with empty rows so UI can show “No rows loaded yet.”
    return res.status(200).json(data || { rows: [] });
  } catch (err) {
    return res.status(500).json({
      error: "GA4 API request failed (source-medium)",
      details: String(err?.message || err),
    });
  }
}
