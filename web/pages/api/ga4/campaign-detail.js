// web/pages/api/ga4/campaign-detail.js
import { getBearerForRequest } from "../../lib/server/ga4-session.js";

/**
 * Drill-down for a specific campaign (exact match on sessionCampaignName).
 * Returns:
 *  - totals: sessions, totalUsers, purchases, purchaseRevenue
 *  - sourceMedium: by sessionSource/sessionMedium
 *  - adContent: by adContent
 *  - term: by manualTerm
 *
 * Accepts: { propertyId, startDate, endDate, filters, campaign, limit }
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
      campaign = "",
      limit = 25,
    } = req.body || {};

    if (!propertyId || !startDate || !endDate || !campaign.trim()) {
      res.status(400).json({ ok: false, error: "propertyId, startDate, endDate, campaign are required" });
      return;
    }

    const baseFilter = buildDimensionFilter(filters);
    const campaignFilter = {
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: campaign.trim(), caseSensitive: false },
      },
    };
    const combinedFilter = combineFilters(baseFilter, campaignFilter);

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
      propertyId
    )}:runReport`;

    // Totals
    const totalsBody = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "purchases" },
        { name: "purchaseRevenue" },
      ],
      ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
    };

    // Source / Medium
    const srcMedBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "purchases" },
        { name: "purchaseRevenue" },
      ],
      limit: String(Math.max(1, Math.min(1000, Number(limit) || 25))),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
    };

    // Ad Content (utm_content)
    const adContentBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "adContent" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "purchases" },
        { name: "purchaseRevenue" },
      ],
      limit: String(Math.max(1, Math.min(1000, Number(limit) || 25))),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
    };

    // Term (utm_term)
    const termBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "manualTerm" }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "purchases" },
        { name: "purchaseRevenue" },
      ],
      limit: String(Math.max(1, Math.min(1000, Number(limit) || 25))),
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
    };

    const [totals, sourceMedium, adContent, term] = await Promise.all([
      gaRun(url, bearer, totalsBody),
      gaRun(url, bearer, srcMedBody),
      gaRun(url, bearer, adContentBody),
      gaRun(url, bearer, termBody),
    ]);

    res.status(200).json({
      ok: true,
      totals,
      sourceMedium,
      adContent,
      term,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

async function gaRun(url, bearer, body) {
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
    throw new Error(data?.error?.message || "GA4 error");
  }
  return data;
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

function combineFilters(base, extraFilterNode) {
  if (!base && extraFilterNode) return extraFilterNode;
  if (base && !extraFilterNode) return base;
  if (!base && !extraFilterNode) return null;
  return { andGroup: [...(base.andGroup || []), extraFilterNode] };
}
