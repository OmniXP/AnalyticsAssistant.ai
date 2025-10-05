// /workspaces/insightsgpt/web/pages/api/ga4/campaign-detail.js
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

// Build a GA4 dimensionFilter that ANDs: campaign + (optional) country + (optional) channel group
function buildFilter({ campaignName, filters }) {
  const expr = [];

  if (campaignName) {
    expr.push({
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: campaignName },
      },
    });
  }

  if (filters?.country && filters.country !== "All") {
    expr.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: filters.country },
      },
    });
  }

  if (filters?.channelGroup && filters.channelGroup !== "All") {
    expr.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: filters.channelGroup },
      },
    });
  }

  if (expr.length === 0) return undefined;
  return { andGroup: { expressions: expr } };
}

async function runReport({ accessToken, propertyId, body }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg = json?.error?.message || text || `HTTP ${res.status}`;
    const err = new Error(`GA4 API error (campaign-detail): ${msg}`);
    err.details = json || text;
    throw err;
  }
  return json || {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const {
    propertyId,
    startDate,
    endDate,
    campaign,         // required campaign name string
    filters = {},     // { country: "All"|name, channelGroup: "All"|name }
    limit = 25,
  } = req.body || {};

  if (!propertyId || !startDate || !endDate || !campaign) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate/campaign" });
  }

  const dimensionFilter = buildFilter({ campaignName: campaign, filters });

  // Totals for the campaign (compute conversions/AOV on the client if you like)
  const totalsReq = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "transactions" },
      { name: "totalRevenue" },
    ],
    dimensionFilter,
    limit: 1,
  };

  // Breakdown 1: Source / Medium within the campaign
  const srcMedReq = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "transactions" },
      { name: "totalRevenue" },
    ],
    dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    dimensionFilter,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  };

  // Breakdown 2: Ad Content (utm_content)
  const contentReq = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "transactions" },
      { name: "totalRevenue" },
    ],
    dimensions: [{ name: "sessionAdContent" }],
    dimensionFilter,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  };

  // Breakdown 3: Term (utm_term / manual term)
  const termReq = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "transactions" },
      { name: "totalRevenue" },
    ],
    dimensions: [{ name: "sessionManualTerm" }],
    dimensionFilter,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  };

  try {
    const [totals, srcMed, content, term] = await Promise.all([
      runReport({ accessToken: ga.access_token, propertyId, body: totalsReq }),
      runReport({ accessToken: ga.access_token, propertyId, body: srcMedReq }),
      runReport({ accessToken: ga.access_token, propertyId, body: contentReq }),
      runReport({ accessToken: ga.access_token, propertyId, body: termReq }),
    ]);

    return res.status(200).json({
      totals,
      sourceMedium: srcMed,
      adContent: content,
      term,
      meta: { campaign, filters, startDate, endDate },
    });
  } catch (e) {
    return res.status(400).json({ error: "GA4 API error (campaign-detail)", details: e.details || String(e) });
  }
}
