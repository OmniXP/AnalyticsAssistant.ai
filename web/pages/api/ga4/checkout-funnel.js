// web/pages/api/ga4/checkout-funnel.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

function buildDimFilter(filters = {}) {
  const exprs = [];
  if (filters.country && filters.country !== "All") {
    exprs.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } } });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    exprs.push({ filter: { fieldName: "defaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } } });
  }
  if (!exprs.length) return undefined;
  return { andGroup: { expressions: exprs } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });
  try {
    const { bearer, error } = await getBearerForRequest(req);
    if (error || !bearer) return res.status(401).json({ ok: false, error: error || "No bearer" });

    const { propertyId, startDate, endDate, filters } = req.body || {};
    if (!propertyId) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    const events = ["add_to_cart", "begin_checkout", "add_shipping_info", "add_payment_info", "purchase"];

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: "eventName", inListFilter: { values: events } } },
            ...(buildDimFilter(filters)?.andGroup?.expressions || []),
          ],
        },
      },
    };

    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: json?.error?.message || "GA4 error" });

    const steps = Object.fromEntries(events.map((e) => [e, 0]));
    for (const row of json.rows || []) {
      const name = row.dimensionValues?.[0]?.value || "";
      const val = Number(row.metricValues?.[0]?.value || 0);
      if (steps[name] != null) steps[name] += val;
    }
    return res.status(200).json({ ok: true, steps });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
