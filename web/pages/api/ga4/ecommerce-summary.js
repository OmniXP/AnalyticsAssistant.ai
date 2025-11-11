// web/pages/api/ga4/ecommerce-summary.js
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

    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "addToCarts" },
        { name: "beginCheckout" },
        { name: "transactions" },
        { name: "purchaseRevenue" },
      ],
      dimensionFilter: buildDimFilter(filters),
    };

    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: json?.error?.message || "GA4 error" });

    // Totals row is available via row aggregation if "keepEmptyRows": false; easiest is sum across rows
    const totals = (json.rows || []).reduce(
      (a, r) => {
        const mv = r.metricValues || [];
        a.sessions += Number(mv[0]?.value || 0);
        a.users += Number(mv[1]?.value || 0);
        a.addToCarts += Number(mv[2]?.value || 0);
        a.beginCheckout += Number(mv[3]?.value || 0);
        a.transactions += Number(mv[4]?.value || 0);
        a.revenue += Number(mv[5]?.value || 0);
        return a;
      },
      { sessions: 0, users: 0, addToCarts: 0, beginCheckout: 0, transactions: 0, revenue: 0 }
    );

    const cvr = totals.sessions > 0 ? (totals.transactions / totals.sessions) * 100 : 0;
    const aov = totals.transactions > 0 ? totals.revenue / totals.transactions : 0;

    return res.status(200).json({ ok: true, totals: { ...totals, cvr, aov } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
