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

async function runReport(accessToken, propertyId, { startDate, endDate, metrics, dimensions, dimensionFilter }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((m) => ({ name: m })),
    dimensions: dimensions.map((d) => ({ name: d })),
    dimensionFilter,
    limit: 1000,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`GA4 API error — ${JSON.stringify(data)}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "No access token in session" });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  // Events representing the funnel (adjust labels if you use different steps)
  const steps = [
    { event: "add_to_cart", label: "Add to cart" },
    { event: "begin_checkout", label: "Begin checkout" },
    { event: "add_shipping_info", label: "Add shipping" },
    { event: "add_payment_info", label: "Add payment" },
    { event: "purchase", label: "Purchase" },
  ];

  try {
    // Single report: eventName + eventCount; filter to only these events
    const data = await runReport(ga.access_token, propertyId, {
      startDate,
      endDate,
      metrics: ["eventCount"],
      dimensions: ["eventName"],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: steps.map((s) => s.event) },
        },
      },
    });

    const counts = Object.create(null);
    for (const row of data.rows || []) {
      const name = row.dimensionValues?.[0]?.value || "";
      const count = Number(row.metricValues?.[0]?.value || 0);
      counts[name] = (counts[name] || 0) + count;
    }

    const rows = steps.map((s) => ({
      step: s.label,
      count: counts[s.event] ? Number(counts[s.event]) : 0,
    }));

    // Optional hint if everything is zero
    let note = "";
    if (rows.every((r) => r.count === 0)) {
      note =
        "No checkout-step events counted in this date range. Confirm your GA4 events use the standard names (add_to_cart, begin_checkout, add_shipping_info, add_payment_info, purchase) and are sent for the selected dates.";
    }

    return res.status(200).json({ rows, note });
  } catch (e) {
    const msg = e?.message || "Unknown error";
    return res.status(500).json({ error: `GA4 API error (checkout-funnel) — ${msg}`, details: e?.details || null });
  }
}
