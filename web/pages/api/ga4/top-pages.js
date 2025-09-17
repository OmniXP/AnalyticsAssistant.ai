// /workspaces/insightsgpt/web/pages/api/ga4/top-pages.js
// GA4 "Top Pages" API route that uses Iron Session (Fe26.* cookie) to read your Google access token.
// This is self-contained: it defines `sessionOptions` inline so you don't need to import from elsewhere.

import { withIronSessionApiRoute } from "iron-session/next";

// If your project already defines sessionOptions centrally, you can delete this block and import it instead.
// For now we inline it to avoid path issues.
const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { propertyId, startDate, endDate, limit = 10 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId, startDate or endDate" });
  }

  // Token locations used in the rest of the app. We try several keys to be safe.
  const token =
    (req.session && req.session.google && req.session.google.accessToken) ||
    (req.session && req.session.tokens && req.session.tokens.access_token) ||
    req.session?.accessToken ||
    null;

  if (!token) {
    return res.status(401).json({
      error: "No access token in session. Click 'Connect Google Analytics' then try again.",
      sessionKeysPresent: Object.keys(req.session || {}),
    });
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
    propertyId
  )}:runReport`;

  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pageTitle" }, { name: "pagePathPlusQueryString" }],
    metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  };

  try {
    const gaRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const raw = await gaRes.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      return res
        .status(gaRes.status || 502)
        .json({ error: "Upstream response was not JSON", upstream: raw?.slice(0, 1000) || "" });
    }

    if (!gaRes.ok) {
      return res.status(gaRes.status).json(json || { error: "GA4 error", raw });
    }

    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}

export default withIronSessionApiRoute(handler, sessionOptions);
