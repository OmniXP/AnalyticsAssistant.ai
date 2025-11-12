// web/pages/api/ga4/checkout-funnel.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

function buildFilter(filters = {}) {
  const andFilter = [];
  if (filters.country && filters.country !== "All") {
    andFilter.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: String(filters.country) } } });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    andFilter.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) } } });
  }
  return andFilter.length ? { andGroup: { expressions: andFilter } } : undefined;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { propertyId, startDate, endDate, filters = {} } = req.body || {};
  if (!propertyId || !startDate || !endDate) return res.status(400).json({ ok: false, error: "Missing propertyId or date range" });

  try {
    const bearer = await getBearerForRequest(req, res);

    const payload = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      limit: "1000",
      ...(buildFilter(filters) ? { dimensionFilter: buildFilter(filters) } : {}),
    };

    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: json?.error?.message || `GA error ${resp.status}`, details: json });

    const rows = json?.rows || [];
    const byName = Object.create(null);
    for (const r of rows) {
      const name = r?.dimensionValues?.[0]?.value || "";
      const count = Number(r?.metricValues?.[0]?.value || 0);
      byName[name] = (byName[name] || 0) + count;
    }

    res.status(200).json({
      ok: true,
      steps: {
        add_to_cart: byName["add_to_cart"] || 0,
        begin_checkout: byName["begin_checkout"] || 0,
        add_shipping_info: byName["add_shipping_info"] || 0,
        add_payment_info: byName["add_payment_info"] || 0,
        purchase: byName["purchase"] || 0,
      },
    });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: status === 401 || status === 403 ? "No bearer" : e?.message || "Unexpected error" });
  }
}
