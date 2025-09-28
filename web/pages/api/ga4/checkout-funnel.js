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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) {
    return res.status(401).json({ error: "Not connected" });
  }

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Missing propertyId/startDate/endDate", got: req.body || null });
  }

  // One query: count events grouped by eventName, then map to the steps we care about
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    limit: 1000,
  };

  const gaRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ga.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await gaRes.json().catch(() => null);
  if (!gaRes.ok) {
    return res.status(gaRes.status).json({
      error: "GA4 API error (checkout-funnel)",
      details: data || null,
    });
  }

  const rows = data?.rows || [];
  const lookup = {};
  for (const r of rows) {
    const name = r?.dimensionValues?.[0]?.value || "";
    const count = Number(r?.metricValues?.[0]?.value || 0);
    if (name) lookup[name] = count;
  }

  const steps = {
    addToCart: lookup["add_to_cart"] || 0,
    beginCheckout: lookup["begin_checkout"] || 0,
    addShipping: lookup["add_shipping_info"] || 0,
    addPayment: lookup["add_payment_info"] || 0,
    purchase: lookup["purchase"] || 0,
  };

  return res.status(200).json({
    steps,
    dateRange: { start: startDate, end: endDate },
  });
}
