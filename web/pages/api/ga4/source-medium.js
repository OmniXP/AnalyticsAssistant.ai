// /workspaces/insightsgpt/web/pages/api/ga4/source-medium.js
import { getIronSession } from "iron-session";

// Same session options you use elsewhere
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

// Helper to build GA4 filter expressions
function buildDimensionFilter(filters) {
  // filters = { country: "United Kingdom"|"All", channelGroup: "Direct"|"All" }
  const exprs = [];

  if (filters?.country && filters.country !== "All") {
    exprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: filters.country, caseSensitive: false },
      },
    });
  }

  if (filters?.channelGroup && filters.channelGroup !== "All") {
    exprs.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: filters.channelGroup, caseSensitive: false },
      },
    });
  }

  if (exprs.length === 0) return undefined; // no filter
  if (exprs.length === 1) return exprs[0];

  // AND the filters together
  return { andGroup: { expressions: exprs } };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) {
      return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });
    }

    const { propertyId, startDate, endDate, limit = 25, filters = {} } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "source" }, { name: "medium" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [
        { metric: { metricName: "sessions" }, desc: true }
      ],
      limit: String(limit),
    };

    const dimensionFilter = buildDimensionFilter(filters);
    if (dimensionFilter) body.dimensionFilter = dimensionFilter;

    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      // bubble up useful message
      return res.status(apiRes.status).json({
        error: "GA4 API error (source-medium)",
        details: data,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Server error (source-medium)", message: String(err?.message || err) });
  }
}