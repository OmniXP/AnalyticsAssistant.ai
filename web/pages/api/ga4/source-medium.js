// /workspaces/insightsgpt/web/pages/api/ga4/source-medium.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt", // must match your other routes
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const {
    propertyId,
    startDate,
    endDate,
    limit = 20,
    includeCampaign = false,
  } = req.body || {};

  if (!propertyId || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Missing propertyId/startDate/endDate" });
  }

  const session = await getIronSession(req, res, sessionOptions);
  const token = session?.gaTokens?.access_token;
  if (!token) {
    return res.status(401).json({ error: "Not connected" });
  }

  // Use session-scoped dimensions with 'sessions'
  const dimensions = [{ name: "sessionSource" }, { name: "sessionMedium" }];
  if (includeCampaign) {
    dimensions.push(
      { name: "sessionCampaignId" },
      { name: "sessionCampaignName" }
    );
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
    propertyId
  )}:runReport`;

  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    dimensions,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
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
      // leave json = null; we’ll return the raw if needed
    }

    if (!gaRes.ok) {
      return res.status(gaRes.status).json(json || { error: "GA4 error", raw });
    }

    return res.status(200).json(json || {});
  } catch (e) {
    return res.status(500).json({ error: "Server error", message: String(e) });
  }
}
