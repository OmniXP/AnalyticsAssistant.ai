// /workspaces/insightsgpt/web/pages/api/ga4/checkout-funnel.js
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

const STEP_EVENTS = [
  "add_to_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "purchase",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).send("Not connected");

  const { propertyId, startDate, endDate, filters } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).send("Missing propertyId/startDate/endDate");
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
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
  if (!apiRes.ok) {
    return res.status(apiRes.status).json({
      error: "GA4 API error (checkout-funnel)",
      details: data || null,
    });
  }

  const steps = Object.fromEntries(STEP_EVENTS.map((e) => [e, 0]));
  for (const row of data?.rows || []) {
    const name = row?.dimensionValues?.[0]?.value;
    const count = Number(row?.metricValues?.[0]?.value || 0);
    if (name && steps.hasOwnProperty(name)) steps[name] = count;
  }

  return res.status(200).json({ steps, dateRange: { start: startDate, end: endDate } });
}
