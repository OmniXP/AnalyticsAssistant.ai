// /workspaces/insightsgpt/web/pages/api/ga4/top-pages.js
// Next.js API route that reads your Google token from Iron Session using getIronSession
// (no 'iron-session/next' subpath needed).

import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { propertyId, startDate, endDate, limit = 10 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId, startDate or endDate" });
  }

  // Read the session (Fe26.* cookie)
  const session = await getIronSession(req, res, sessionOptions);

  // Try common token keys used by your app
  const token =
    session?.google?.accessToken ||
    session?.tokens?.access_token ||
    session?.accessToken ||
    null;

  if (!token) {
    return res.status(401).json({
      error: "No access token in session. Click 'Connect Google Analytics' then try again.",
      sessionKeysPresent: Object.keys(session || {}),
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
