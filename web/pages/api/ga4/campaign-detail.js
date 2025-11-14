// web/pages/api/ga4/campaign-detail.js
import { getBearerForRequest } from "../../../server/ga4-session.js";

/**
 * Drill-down for a specific campaign
 * Filters rows to EXACT sessionCampaignName
 * Returns: { totals, sourceMedium, adContent, term }
 * POST body: { propertyId, startDate, endDate, filters, campaign, limit }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const { propertyId, startDate, endDate, filters = {}, campaign = "", limit = 25 } = req.body || {};
    if (!propertyId || !startDate || !endDate || !campaign.trim()) {
      return res.status(400).json({ ok: false, error: "propertyId, startDate, endDate, campaign are required" });
    }

    const combinedFilter = combineFilters(buildDimensionFilter(filters), {
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: campaign.trim(), caseSensitive: false },
      },
    });

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;

    const payloads = {
      totals: {
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "purchases" }, { name: "purchaseRevenue" }],
        ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
      },
      sourceMedium: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "purchases" }, { name: "purchaseRevenue" }],
        limit: String(Math.max(1, Math.min(1000, Number(limit) || 25))),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
      },
      adContent: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "adContent" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "purchases" }, { name: "purchaseRevenue" }],
        limit: String(Math.max(1, Math.min(1000, Number(limit) || 25))),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
      },
      term: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "manualTerm" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "purchases" }, { name: "purchaseRevenue" }],
        limit: String(Math.max(1, Math.min(1000, Number(limit) || 25))),
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        ...(combinedFilter ? { dimensionFilter: combinedFilter } : {}),
      },
    };

    const [totals, sourceMedium, adContent, term] = await Promise.all(
      Object.values(payloads).map((body) => gaRun(url, bearer, body))
    );

    res.status(200).json({ ok: true, totals, sourceMedium, adContent, term });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

async function gaRun(url, bearer, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "GA4 error");
  return data;
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

function combineFilters(base, extra) {
  if (!base && extra) return extra;
  if (base && !extra) return base;
  if (!base && !extra) return null;
  return { andGroup: [...(base.andGroup || []), extra] };
}
