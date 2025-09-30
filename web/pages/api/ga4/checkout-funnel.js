// /web/pages/api/ga4/checkout-funnel.js
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

function buildFilterExpression({ country, channel }) {
  const andExprs = [];

  if (country) {
    andExprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: String(country) },
      },
    });
  }
  if (channel) {
    andExprs.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: String(channel) },
      },
    });
  }

  // Restrict to the funnel events we care about
  const funnelEvents = [
    "add_to_cart",
    "begin_checkout",
    "add_shipping_info",
    "add_payment_info",
    "purchase",
  ];
  const orEvents = funnelEvents.map((ev) => ({
    filter: {
      fieldName: "eventName",
      stringFilter: { matchType: "EXACT", value: ev },
    },
  }));

  const base = { orGroup: { expressions: orEvents } };

  if (andExprs.length === 0) return base;
  return { andGroup: { expressions: [base, ...andExprs] } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const { propertyId, startDate, endDate, country, channel } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const filterExpression = buildFilterExpression({
      country: normalise(country),
      channel: normalise(channel),
    });

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      ...(filterExpression ? { dimensionFilter: filterExpression } : {}),
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
      return res.status(apiRes.status).json({ error: "GA4 API error (checkout-funnel)", details: data });
    }

    // Reduce into a simple dictionary
    const steps = { add_to_cart: 0, begin_checkout: 0, add_shipping_info: 0, add_payment_info: 0, purchase: 0 };
    (data?.rows || []).forEach((r) => {
      const name = r?.dimensionValues?.[0]?.value || "";
      const count = Number(r?.metricValues?.[0]?.value || 0);
      if (Object.prototype.hasOwnProperty.call(steps, name)) steps[name] = count;
    });

    return res.status(200).json({
      steps,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error (checkout-funnel)", details: String(e?.message || e) });
  }
}

function normalise(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "all") return null;
  return v;
}
