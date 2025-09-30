// /workspaces/insightsgpt/web/pages/api/ga4/source-medium.js
import { getIronSession } from "iron-session";
import { buildDimensionFilter } from "../../../lib/ga4";

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
  if (!ga?.access_token) return res.status(401).send("Not connected");

  const { propertyId, startDate, endDate, filters, limit = 25 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).send("Missing propertyId/startDate/endDate");
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "source" }, { name: "medium" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    limit,
  };

  const df = buildDimensionFilter(filters);
  if (df) body.dimensionFilter = df;

  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ga.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json().catch(() => null);
  if (!apiRes.ok) return res.status(apiRes.status).json(data || { error: "GA4 API error (source-medium)" });
  res.status(200).json(data);
}
