// web/pages/api/ga4/timeseries.js
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

  const { propertyId, startDate, endDate, filters = {}, granularity = "daily" } = req.body || {};
  if (!propertyId || !startDate || !endDate) return res.status(400).json({ ok: false, error: "Missing propertyId or date range" });

  const dim = granularity === "weekly" ? "yearWeekISO" : "date";

  try {
    const bearer = await getBearerForRequest(req, res);

    const payload = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dim }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "transactions" }, { name: "purchaseRevenue" }, { name: "totalRevenue" }],
      orderBys: [{ dimension: { dimensionName: dim }, desc: false }],
      limit: "1000",
      ...(buildFilter(filters) ? { dimensionFilter: buildFilter(filters) } : {}),
    };

    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, error: json?.error?.message || `GA error ${resp.status}`, details: json });

    const headers = (json?.metricHeaders || []).map(h => h.name);
    const mval = (row, name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? Number(row?.metricValues?.[idx]?.value || 0) : 0;
    };

    const series = (json?.rows || []).map(r => {
      const revenue = mval(r, "purchaseRevenue") || mval(r, "totalRevenue");
      return {
        period: r?.dimensionValues?.[0]?.value || "",
        sessions: mval(r, "sessions"),
        users: mval(r, "totalUsers"),
        transactions: mval(r, "transactions"),
        revenue,
      };
    });

    res.status(200).json({ ok: true, series });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({ ok: false, error: status === 401 || status === 403 ? "No bearer" : e?.message || "Unexpected error" });
  }
}
