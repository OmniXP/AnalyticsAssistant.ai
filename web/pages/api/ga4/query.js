import { getBearerForRequest } from "../../../server/ga4-session.js";

/**
 * Channels hero: sessions and users by sessionDefaultChannelGroup.
 * POST: { propertyId, startDate, endDate, filters, limit }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const { propertyId, startDate, endDate, filters = {}, limit = 50 } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ ok: false, error: "propertyId, startDate, endDate are required" });
    }

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
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

    return res.status(200).json({ ok: true, rows: data?.rows ?? [], raw: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

function buildDimensionFilter(filters) {
  const andGroup = [];
  const country = (filters?.country || "").trim();
  if (country && country !== "All") {
    andGroup.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: country, caseSensitive: false } } });
  }
  const channel = (filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    andGroup.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false } } });
  }
  if (!andGroup.length) return null;
  return { andGroup };
}
