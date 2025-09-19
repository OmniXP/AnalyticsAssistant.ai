// web/pages/api/ga4/checkout-funnel.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax", path: "/" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "No access token in session." });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  // Count key checkout events in one call using eventName + eventCount
  const steps = ["view_item", "add_to_cart", "begin_checkout", "add_payment_info", "purchase"];

  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: steps },
      },
    },
    keepEmptyRows: true,
    limit: 50,
  };

  const apiRes = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${ga.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await apiRes.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!apiRes.ok) {
    return res.status(apiRes.status).json(data || { error: text || `HTTP ${apiRes.status}` });
  }

  // Normalize into our preferred order, filling missing steps with zero
  const counts = Object.fromEntries(steps.map(s => [s, 0]));
  for (const r of data.rows || []) {
    const name = r.dimensionValues?.[0]?.value || "";
    const cnt = Number(r.metricValues?.[0]?.value || 0);
    if (name in counts) counts[name] = cnt;
  }
  const normalizedRows = steps.map(s => ({ step: s, count: counts[s] }));

  return res.status(200).json({ rows: normalizedRows, raw: data });
}
