// web/pages/api/ga4/ecommerce-summary.js
import { getBearerForRequest } from "../../lib/server/ga4-session.js";

/**
 * E-commerce KPI totals for a date range:
 * - Metrics: sessions, totalUsers, addToCarts, checkouts, purchases, purchaseRevenue
 *   (Note: GA4 uses "checkouts" for Begin Checkout count in the Data API.)
 * Accepts: { propertyId, startDate, endDate, filters }
 * Returns: { ok: true, totals: { sessions, users, addToCarts, beginCheckout, transactions, revenue, cvr, aov } }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) {
      res.status(401).json({ ok: false, error: "No bearer" });
      return;
    }

    const { propertyId, startDate, endDate, filters = {} } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      res.status(400).json({ ok: false, error: "propertyId, startDate, endDate are required" });
      return;
    }

    const dimensionFilter = buildDimensionFilter(filters);

    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "addToCarts" },
        { name: "checkouts" },          // GA4 Data API metric for Begin Checkout
        { name: "purchases" },
        { name: "purchaseRevenue" },
      ],
      ...(dimensionFilter ? { dimensionFilter } : {}),
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
      propertyId
    )}:runReport`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await r.json();
    if (!r.ok) {
      res.status(r.status).json({ ok: false, error: data?.error?.message || "GA4 error" });
      return;
    }

    // Flatten to a simple totals object
    const m = data?.rows?.[0]?.metricValues || [];
    const sessions = num(m[0]?.value);
    const users = num(m[1]?.value);
    const addToCarts = num(m[2]?.value);
    const beginCheckout = num(m[3]?.value);   // "checkouts"
    const transactions = num(m[4]?.value);    // "purchases"
    const revenue = num(m[5]?.value);         // "purchaseRevenue"

    const cvr = sessions > 0 ? (transactions / sessions) * 100 : 0;
    const aov = transactions > 0 ? revenue / transactions : 0;

    res.status(200).json({
      ok: true,
      totals: { sessions, users, addToCarts, beginCheckout, transactions, revenue, cvr, aov },
      raw: data,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildDimensionFilter(filters) {
  const andGroup = [];

  const country = (filters?.country || "").trim();
  if (country && country !== "All") {
    andGroup.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: country, caseSensitive: false },
      },
    });
  }

  const channel = (filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    andGroup.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false },
      },
    });
  }

  if (andGroup.length === 0) return null;
  return { andGroup };
}
