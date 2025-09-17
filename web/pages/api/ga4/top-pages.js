// /workspaces/insightsgpt/web/pages/api/ga4/top-pages.js
// Queries GA4 Top Pages using the Analytics Data API.
// Expects you are already authenticated (same session as /api/ga4/query).

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { propertyId, startDate, endDate, limit = 10 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId, startDate or endDate" });
  }

  // Try common cookie names used during OAuth; adapt if your app uses a different one.
  const token =
    req.cookies?.ga_access_token ||
    req.cookies?.access_token ||
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "");

  if (!token) {
    return res.status(401).json({
      error: "No access token found. Ensure you're connected via the Google button first.",
      hint: "If you have a helper in /api/ga4/query, reuse that here to fetch the token from session.",
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
      return res.status(gaRes.status || 502).json({
        error: "Upstream response was not JSON",
        upstream: raw?.slice(0, 1000) || "",
      });
    }

    if (!gaRes.ok) {
      return res.status(gaRes.status).json(json || { error: "GA4 error", raw });
    }

    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
