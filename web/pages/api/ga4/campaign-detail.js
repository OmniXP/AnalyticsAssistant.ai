import { getBearerForRequest } from "../../../server/ga4-session.js";
import { enforceDataLimits, withGuards } from "../../../server/usage-limits.js";

/**
 * Campaign drill-down for a specific sessionCampaignName.
 * Returns three blocks: bySourceMedium, byAdContent, byKeyword.
 * POST: { propertyId, startDate, endDate, campaignName, filters }
 */
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const { propertyId, startDate, endDate, campaignName, filters = {} } = req.body || {};
    if (!propertyId || !startDate || !endDate || !campaignName) {
      return res.status(400).json({ ok: false, error: "propertyId, startDate, endDate, campaignName are required" });
    }

    await enforceDataLimits(req, res, { propertyId, startDate, endDate });
    const baseFilter = buildDimensionFilter(filters);
    const exactCampaign = {
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: campaignName, caseSensitive: false },
      },
    };

    // Helper to call GA4 with fallback for incompatible metrics
    async function run(dimensions, includeEcommerce = true) {
      const filter = mergeAnd(baseFilter, exactCampaign);
      const metrics = includeEcommerce
        ? [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "transactions" },
            { name: "purchaseRevenue" },
          ]
        : [
            { name: "sessions" },
            { name: "totalUsers" },
          ];
      
      const orderBys = includeEcommerce
        ? [{ metric: { metricName: "purchaseRevenue" }, desc: true }]
        : [{ metric: { metricName: "sessions" }, desc: true }];
      
      const body = {
        dateRanges: [{ startDate, endDate }],
        dimensions,
        metrics,
        orderBys,
        ...(filter ? { dimensionFilter: filter } : {}),
        limit: 200,
      };
      const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        // If error mentions incompatible metrics, retry without e-commerce metrics
        const errorMsg = data?.error?.message || "";
        if (includeEcommerce && (errorMsg.includes("incompatible") || errorMsg.includes("remove transactions"))) {
          console.log(`[campaign-detail] Retrying without e-commerce metrics for dimensions: ${dimensions.map(d => d.name).join(", ")}`);
          return run(dimensions, false);
        }
        throw new Error(errorMsg || "GA4 error");
      }
      return data;
    }

    // Run queries - make adFormat optional (not all campaigns have ad format data)
    const [bySourceMedium, byAdFormat, byKeyword] = await Promise.all([
      run([{ name: "sessionSource" }, { name: "sessionMedium" }]),
      run([{ name: "adFormat" }]).catch(() => ({ rows: [] })), // Gracefully handle if adFormat fails
      run([{ name: "manualTerm" }]), // UTM term / keyword
    ]);

    return res.status(200).json({
      ok: true,
      bySourceMedium: bySourceMedium?.rows ?? [],
      byAdContent: byAdFormat?.rows ?? [], // Keep same key name for frontend compatibility
      byKeyword: byKeyword?.rows ?? [],
      raw: { bySourceMedium, byAdContent: byAdFormat, byKeyword },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
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
  if (!expressions.length) return null;
  return { andGroup: { expressions } };
}

function mergeAnd(base, extraExpression) {
  if (!base) return { andGroup: { expressions: [extraExpression] } };
  const expressions = base?.andGroup?.expressions ? [...base.andGroup.expressions] : [];
  expressions.push(extraExpression);
  return { andGroup: { expressions } };
}

export default withGuards({ usageKind: "ga4", requirePremium: true }, handler);
