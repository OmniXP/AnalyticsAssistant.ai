// /workspaces/insightsgpt/web/pages/api/ga4/checkout-funnel.js
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

const FUNNEL_EVENTS = [
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
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: FUNNEL_EVENTS },
      },
    },
    limit: 50,
  };

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
    return res
      .status(apiRes.status)
      .json({ error: "GA4 API error (checkout-funnel)", details: data });
  }

  const rows = data?.rows || [];
  const m = new Map(rows.map(r => [r?.dimensionValues?.[0]?.value || "", Number(r?.metricValues?.[0]?.value || 0)]));

  const steps = {
    add_to_cart: m.get("add_to_cart") || 0,
    begin_checkout: m.get("begin_checkout") || 0,
    add_shipping_info: m.get("add_shipping_info") || 0,
    add_payment_info: m.get("add_payment_info") || 0,
    purchase: m.get("purchase") || 0,
  };

  return res.status(200).json({
    steps,
    dateRange: { start: startDate, end: endDate },
  });
}
