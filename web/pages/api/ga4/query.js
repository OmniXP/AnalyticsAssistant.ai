import { getBearerForRequest } from "../../../server/ga4-session.js";
import { enforceDataLimits, withUsageGuard } from "../../../server/usage-limits.js";

/**
 * Channels hero: sessions and users by sessionDefaultChannelGroup.
 * POST: { propertyId, startDate, endDate, filters, limit }
 */
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    // Debug: log cookie header
    console.log("[query] Cookie header:", req.headers?.cookie?.substring(0, 200) || "none");
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const { propertyId, startDate, endDate, filters = {}, limit = 50 } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ ok: false, error: "propertyId, startDate, endDate are required" });
    }

    await enforceDataLimits(req, res, { propertyId, startDate, endDate });

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
    // If it's an authentication error from getBearerForRequest, return 401
    const errorMsg = String(e?.message || e);
    if (errorMsg.includes("Google session expired") || errorMsg.includes("No session cookie") || errorMsg.includes("No bearer") || errorMsg.includes("No tokens")) {
      console.error("[query] Authentication error:", errorMsg);
      return res.status(401).json({ ok: false, error: errorMsg });
    }
    console.error("[query] Unexpected error:", e);
    return res.status(500).json({ ok: false, error: errorMsg });
  }
}

export default withUsageGuard("ga4", handler);

function buildDimensionFilter(filters) {
  if (!filters || typeof filters !== "object") return null;
  const expressions = [];
  const country = String(filters?.country || "").trim();
  if (country && country !== "All") {
    expressions.push({ filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: country, caseSensitive: false } } });
  }
  const channel = String(filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    expressions.push({ filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false } } });
  }
  const deviceType = String(filters?.deviceType || "All").trim();
  if (deviceType && deviceType !== "All") {
    const deviceValue = deviceType === "Mobile" ? "mobile" : deviceType === "Desktop" ? "desktop" : deviceType.toLowerCase();
    expressions.push({ filter: { fieldName: "deviceCategory", stringFilter: { matchType: "EXACT", value: deviceValue, caseSensitive: false } } });
  }
  if (!expressions.length) return null;
  return { andGroup: { expressions } };
}
