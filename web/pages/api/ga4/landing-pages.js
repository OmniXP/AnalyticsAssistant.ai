// /workspaces/insightsgpt/web/pages/api/ga4/landing-pages.js
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).send("No access token in session. Click 'Connect Google Analytics' then try again.");

  const { propertyId, startDate, endDate, limit = 25 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).send("Missing propertyId/startDate/endDate");
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "landingPagePlusQueryString" }, // landing page path + query
      { name: "pageTitle" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" }, // page views metric in GA4
      { name: "conversions" },     // all conversions
    ],
    orderBys: [
      {
        metric: { metricName: "screenPageViews" },
        desc: true,
      },
    ],
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

  const data = await apiRes.json();
  if (!apiRes.ok) return res.status(apiRes.status).json(data);
  res.status(200).json(data);
}
