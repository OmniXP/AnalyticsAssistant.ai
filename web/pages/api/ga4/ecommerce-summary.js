import { getBearerForRequest } from "../../../server/ga4-session.js";
import { withUsageGuard } from "../../../server/usage-limits.js";

/**
 * E-commerce KPI totals for a date range.
 * Metrics: sessions, totalUsers, addToCarts, checkouts, transactions, purchaseRevenue
 * POST body: { propertyId, startDate, endDate, filters }
 * Returns: { ok: true, totals: {...}, raw }
 */
async function handler(req, res) {
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
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "addToCarts" },
        { name: "checkouts" },         // begin checkout
        { name: "transactions" },      // purchase count
        { name: "purchaseRevenue" },   // revenue
      ],
      ...(buildDimensionFilter(filters) ? { dimensionFilter: buildDimensionFilter(filters) } : {}),
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: data?.error?.message || "GA4 error" });

    const m = data?.rows?.[0]?.metricValues || [];
    const sessions = n(m[0]?.value);
    const users = n(m[1]?.value);
    const addToCarts = n(m[2]?.value);
    const beginCheckout = n(m[3]?.value);   // checkouts
    const transactions = n(m[4]?.value);    // transactions
    const revenue = n(m[5]?.value);         // purchaseRevenue

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

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function buildDimensionFilter(filters) {
  const expressions = [];
  const country = (filters?.country || "").trim();
  if (country && country !== "All") {
    expressions.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: country, caseSensitive: false } } });
  }
  const channel = (filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    expressions.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false } } });
  }
  // Normalize "Both" to "All" for backward compatibility
  const deviceTypeRaw = (filters?.deviceType || "").trim();
  const deviceType = deviceTypeRaw === "Both" ? "All" : deviceTypeRaw;
  if (deviceType && deviceType !== "All") {
    const deviceValue = deviceType === "Mobile" ? "mobile" : deviceType === "Desktop" ? "desktop" : deviceType.toLowerCase();
    expressions.push({ filter: { fieldName: "deviceCategory", stringFilter: { matchType: "EXACT", value: deviceValue, caseSensitive: false } } });
  }
  if (!expressions.length) return null;
  return { andGroup: { expressions } };
}

export default withUsageGuard("ga4", handler);
