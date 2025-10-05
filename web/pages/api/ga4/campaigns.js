// /workspaces/insightsgpt/web/pages/api/ga4/campaigns.js
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

// Build GA4 dimension filters from our UI filters
function buildDimensionFilter(filters) {
  if (!filters) return undefined;

  const andGroup = { andGroup: { expressions: [] } };

  // Country filter
  if (filters.country && filters.country !== "All") {
    andGroup.andGroup.expressions.push({
      filter: {
        fieldName: "country",
        stringFilter: { value: String(filters.country), matchType: "EXACT" },
      },
    });
  }

  // Channel Group filter
  if (filters.channelGroup && filters.channelGroup !== "All") {
    andGroup.andGroup.expressions.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { value: String(filters.channelGroup), matchType: "EXACT" },
      },
    });
  }

  if (andGroup.andGroup.expressions.length === 0) return undefined;
  return andGroup;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const { propertyId, startDate, endDate, filters, limit = 50 } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      // Keep it simple & compatible: campaign only
      dimensions: [{ name: "sessionCampaign" }],
      limit: Math.max(1, Math.min(100000, Number(limit) || 50)),
    };

    const dimFilter = buildDimensionFilter(filters);
    if (dimFilter) body.dimensionFilter = dimFilter;

    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const dataText = await apiRes.text();
    let data = null;
    try { data = dataText ? JSON.parse(dataText) : null; } catch {}

    if (!apiRes.ok) {
      const msg = data?.error?.message || dataText || `GA4 API error (campaigns)`;
      return res.status(apiRes.status).json({ error: msg, details: data || null });
    }

    return res.status(200).json(data || {});
  } catch (err) {
    return res.status(500).json({ error: "Server error (campaigns)", details: String(err?.message || err) });
  }
}
