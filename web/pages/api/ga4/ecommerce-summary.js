// web/pages/api/ga4/ecommerce-summary.js
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
      // Request both revenue metrics; GA will return those it supports
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "addToCarts" },
        { name: "beginCheckout" },
        { name: "transactions" },
        { name: "purchaseRevenue" },
        { name: "totalRevenue" },
      ],
      ...(buildFilter(filters) ? { dimensionFilter: buildFilter(filters) } : {}),
    };

    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: json?.error?.message || `GA error ${resp.status}`, details: json });

    const mv = (i) => Number(json?.rows?.[0]?.metricValues?.[i]?.value || 0);
    // Map by header name for safety
    const headers = (json?.metricHeaders || []).map(h => h.name);
    const val = (name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? mv(idx) : 0;
    };

    const sessions = val("sessions");
    const users = val("totalUsers");
    const addToCarts = val("addToCarts");
    const beginCheckout = val("beginCheckout");
    const transactions = val("transactions");
    const revenue = val("purchaseRevenue") || val("totalRevenue");

    const cvr = sessions > 0 ? (transactions / sessions) * 100 : 0;
    const aov = transactions > 0 ? revenue / transactions : 0;

    res.status(200).json({
      ok: true,
      totals: { sessions, users, addToCarts, beginCheckout, transactions, revenue, cvr, aov },
    });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: status === 401 || status === 403 ? "No bearer" : e?.message || "Unexpected error" });
  }
}
