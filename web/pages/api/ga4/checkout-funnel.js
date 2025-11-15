import { getBearerForRequest } from "../../../server/ga4-session.js";

/**
 * Checkout funnel event counts for core steps.
 * Returns { steps: { add_to_cart, begin_checkout, add_shipping_info, add_payment_info, purchase }, raw }
 */
const FUNNEL_EVENTS = [
  "add_to_cart",
  "begin_checkout",
  "add_shipping_info",
  "add_payment_info",
  "purchase",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const { propertyId, startDate, endDate, filters = {} } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ ok: false, error: "propertyId, startDate, endDate are required" });
    }

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "eventName",
                inListFilter: { values: FUNNEL_EVENTS, caseSensitive: false },
              },
            },
            ...(buildFilterExpressions(filters)),
          ],
        },
      },
      limit: 100,
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: data?.error?.message || "GA4 error" });

    const steps = Object.fromEntries(FUNNEL_EVENTS.map(n => [n, 0]));
    for (const row of data?.rows || []) {
      const name = row?.dimensionValues?.[0]?.value || "";
      const count = Number(row?.metricValues?.[0]?.value || 0) || 0;
      if (name in steps) steps[name] = count;
    }

    return res.status(200).json({ ok: true, steps, raw: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

function buildFilterExpressions(filters) {
  const out = [];
  const country = (filters?.country || "").trim();
  if (country && country !== "All") {
    out.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: country, caseSensitive: false } } });
  }
  const channel = (filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    out.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false } } });
  }
  return out;
}
