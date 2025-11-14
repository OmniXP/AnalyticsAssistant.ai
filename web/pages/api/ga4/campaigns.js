// web/pages/api/ga4/campaigns.js
import { getBearerForRequest } from "../../lib/server/ga4-session.js";

/**
 * Returns a campaign overview:
 * - Dimensions: sessionCampaignName
 * - Metrics: sessions, totalUsers, purchases, purchaseRevenue
 * Accepts: { propertyId, startDate, endDate, filters, limit }
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

    const {
      propertyId,
      startDate,
      endDate,
      filters = {},
      limit = 100,
    } = req.body || {};

    if (!propertyId || !startDate || !endDate) {
      res.status(400).json({ ok: false, error: "propertyId, startDate, endDate are required" });
      return;
    }

    const dimensionFilter = buildDimensionFilter(filters);

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionCampaignName" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "purchases" },
        { name: "purchaseRevenue" },
      ],
      limit: String(Math.max(1, Math.min(1000, Number(limit) || 100))),
      orderBys: [
        { metric: { metricName: "purchaseRevenue" }, desc: true },
        { metric: { metricName: "purchases" }, desc: true },
        { metric: { metricName: "sessions" }, desc: true },
      ],
      ...(dimensionFilter ? { dimensionFilter } : {}),
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
      propertyId
    )}:runReport`;

    const gaResp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await gaResp.json();
    if (!gaResp.ok) {
      res.status(gaResp.status).json({ ok: false, error: data?.error?.message || "GA4 error" });
      return;
    }

    res.status(200).json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

function buildDimensionFilter(filters) {
  const andGroup = [];

  // Country filter
  const country = (filters?.country || "").trim();
  if (country && country !== "All") {
    andGroup.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: country, caseSensitive: false },
      },
    });
  }

  // Channel Group filter
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
