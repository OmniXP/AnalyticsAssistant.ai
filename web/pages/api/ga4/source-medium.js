import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt", // match your query.js
  cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax", path: "/" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow","POST"); return res.status(405).json({ error:"Method Not Allowed" }); }

  const { propertyId, startDate, endDate, limit = 20, includeCampaign = false } = req.body || {};
  if (!propertyId || !startDate || !endDate) return res.status(400).json({ error:"Missing propertyId/startDate/endDate" });

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  const token = ga?.access_token;
  if (!token) return res.status(401).json({ error: "Not connected" });

  const dimensions = [{ name: "source" }, { name: "medium" }];
  if (includeCampaign) dimensions.push({ name: "campaignId" }, { name: "campaignName" });

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }], // later we can add conversions if available
    dimensions,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit
  };

  const gaRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" },
    body: JSON.stringify(body),
  });

  const raw = await gaRes.text();
  let json = null; try { json = raw ? JSON.parse(raw) : null; } catch {}

  if (!gaRes.ok) return res.status(gaRes.status).json(json || { error:"GA4 error", raw });
  return res.status(200).json(json);
}
