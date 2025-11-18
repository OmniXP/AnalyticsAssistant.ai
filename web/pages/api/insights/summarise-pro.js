// web/pages/api/insights/summarise-pro.js
// Generic summariser for multiple topics with concrete, testable recommendations.

import { finalizeSummary } from "../../../lib/insights/ai-pro.js";
import { withUsageGuard } from "../../../server/usage-limits.js";

function fmtInt(n) { return Number(n || 0).toLocaleString("en-GB"); }
function fmtGBP(n) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n || 0)); }
function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
function topN(arr, n, key) { return [...(arr || [])].sort((a,b)=> (b[key]||0)-(a[key]||0)).slice(0,n); }

function scopeLine(filters) {
  const s = [
    filters?.country && filters.country !== "All" ? `country = ${filters.country}` : "",
    filters?.channelGroup && filters.channelGroup !== "All" ? `channel = ${filters.channelGroup}` : "",
  ].filter(Boolean).join("; ");
  return s ? `Filters: ${s}` : "Filters: none";
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, dateRange = {}, filters = {}, qualitativeNotes = "", ...rest } = req.body || {};
    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} → ${dateRange.end}` : "the selected period";
    const scope = scopeLine(filters);

    let summary = "Summary generated.";
    let drivers = [];
    let resolvedTopic = topic || "channels";

    if (topic === "channels") {
      const { rows = [], totals = {}, prevTotals } = rest;
      const sessions = Number(totals.sessions || 0);
      const users = Number(totals.users || 0);
      const leaders = topN(rows, 5, "sessions").map((r, i) => {
        const share = pct(r.sessions, sessions);
        return `• ${i + 1}. ${r.channel} — ${fmtInt(r.sessions)} sessions (${share}%)`;
      });
      const shiftLine = prevTotals && Number.isFinite(prevTotals.sessions)
        ? `Change vs previous: ${pct(sessions - prevTotals.sessions, prevTotals.sessions) >= 0 ? "+" : ""}${pct(sessions - prevTotals.sessions, prevTotals.sessions)}% sessions.`
        : ``;

      const heavyDirect = rows.some(r => String(r.channel).toLowerCase() === "direct" && pct(r.sessions, sessions) >= 40);

      const suggests = [
        heavyDirect ? `High Direct share suggests brand traffic or tagging gaps; fortify SEO and creator/affiliate to diversify.` : ``,
        `If Organic Search is top 2, protect rankings with content refresh and technical hygiene.`,
        `If Paid holds large share, confirm incrementality and ROAS by campaign/funnel stage.`,
      ].filter(Boolean);

      const tests = [
        `Recommended tests:`,
        `• Landing experience by channel group (SEO vs Paid): intent-aligned hero and CTAs; measure CVR.`,
        `• Creator landers: creator-specific page vs generic PDP; measure AOV and repeat rate.`,
        `• Paid mix: brand+exact vs PMax split; monitor CAC/ROAS and halo on organic/direct.`,
      ];

      summary = [
        `Traffic by Default Channel Group (${period})`,
        scope,
        ``,
        `Totals: ${fmtInt(sessions)} sessions, ${fmtInt(users)} users.`,
        shiftLine,
        ``,
        `Leaders:`,
        ...leaders,
        ``,
        `What this suggests:`,
        ...suggests,
        ``,
        tests.join("\n"),
      ].join("\n");

      drivers = rows.slice(0, 4).map((r, idx) => ({
        theme: "Acquisition",
        label: r.channel || `(row ${idx + 1})`,
        metric: "sessions",
        value: r.sessions || 0,
        share: pct(r.sessions, sessions),
        journey: "Channel mix",
        insight: `${fmtInt(r.sessions)} sessions (${pct(r.sessions, sessions)}% share)`,
        example: `User arrives via ${r.channel}, expects matching promise on landing, and ${r.sessions > r.users ? "explores" : "bounces"}.`,
      }));
    }

    else if (topic === "landing-pages") {
      const { rows = [] } = rest;
      const total = rows.reduce((a, r) => a + (r.sessions || 0), 0);
      const leaders = topN(rows, 5, "sessions");
      const leadersLines = leaders.map((r, i) => `• ${i + 1}. ${r.landing} — ${fmtInt(r.sessions)} sessions (${r.source}/${r.medium})`);

      const suggests = [
        `Leaders should load fast (LCP), state value props above the fold, and funnel to the primary goal.`,
        `Surface delivery/returns and trust on the first screen for mobile.`,
      ];

      const tests = [
        `Recommended tests:`,
        `• Hero copy: benefit-led vs social-proof-led on top landing page; measure CTA click-through.`,
        `• Above-the-fold trust elements: delivery promise and review stars vs control; measure ATC.`,
        `• Internal links: add “related” blocks to money pages; track click-through and assisted conversions.`,
      ];

      summary = [
        `Landing Pages × Attribution (${period})`,
        scope,
        ``,
        `Total sessions: ${fmtInt(total)}.`,
        `Leaders:`,
        ...leadersLines,
        ``,
        `What this suggests:`,
        ...suggests,
        ``,
        tests.join("\n"),
      ].join("\n");

      drivers = leaders.map((r, idx) => ({
        theme: idx === 0 ? "Acquisition" : "Content",
        label: r.landing,
        metric: "sessions",
        value: r.sessions || 0,
        share: pct(r.sessions, total),
        journey: "Landing experience",
        insight: `${fmtInt(r.sessions)} sessions with ${fmtInt(r.users)} users · ${fmtInt(r.transactions || 0)} transactions.`,
        example: `Visitor lands on ${r.landing} from ${r.source}/${r.medium} and needs instant proof + offer clarity.`,
      }));
    }

    else if (topic === "products") {
      const { rows = [] } = rest;
      const revenue = rows.reduce((a, r) => a + (r.revenue || 0), 0);
      const topByRevenue = topN(rows, 5, "revenue").map((r, i) =>
        `• ${i + 1}. ${r.name} — ${fmtGBP(r.revenue)} (${fmtInt(r.views)} views, ${fmtInt(r.carts)} carts, ${fmtInt(r.purchases)} purchases)`
      );

      const suggests = [
        `Protect winners with stock depth and price integrity; mirror their attributes in new product development.`,
        `Low view but high conversion items deserve more traffic; route internal links and paid to them.`,
      ];

      const tests = [
        `Recommended tests:`,
        `• Cross-sell packs based on winners; measure AOV and attach rate.`,
        `• Price elasticity on top SKUs: small price steps vs control; observe margin-adjusted revenue.`,
        `• Badge treatments (“Bestseller”, “Staff pick”) on PLP/PDP; measure click-through and CVR.`,
      ];

      summary = [
        `Products (${period})`,
        scope,
        ``,
        `Revenue: ${fmtGBP(revenue)}.`,
        `Leaders:`,
        ...topByRevenue,
        ``,
        `What this suggests:`,
        ...suggests,
        ``,
        tests.join("\n"),
      ].join("\n");

      drivers = topN(rows, 5, "revenue").map((r, idx) => ({
        theme: idx === 0 ? "Acquisition" : "Content",
        label: r.name || r.id || `(item ${idx + 1})`,
        metric: "revenue",
        value: r.revenue || 0,
        share: pct(r.revenue || 0, revenue),
        journey: "Product funnel",
        insight: `${fmtGBP(r.revenue)} revenue · ${fmtInt(r.views)} views · ${fmtInt(r.purchases)} purchases.`,
        example: `Shopper discovers ${r.name}, evaluates proof/price, and either adds to cart or bounces.`,
      }));
    }

    else if (topic === "timeseries") {
      const { series = [], granularity } = rest;
      if (!series.length) {
        summary = `No timeseries rows for ${period}. ${scope}`;
      } else {
        const first = series[0], last = series[series.length - 1];
        const d = (a, b) => a > 0 ? Math.round(((b - a) / a) * 100) : 0;
        const sDelta = d(first.sessions || 0, last.sessions || 0);
        const uDelta = d(first.users || 0, last.users || 0);
        const suggests = [
          Math.abs(sDelta) >= 10 ? `Meaningful ${sDelta > 0 ? "uplift" : "drop"} in sessions; inspect campaign launches, content pushes, or technical changes around change points.` : ``,
          `Overlay paid campaigns and new content publishes on the trend to attribute spikes.`,
        ].filter(Boolean);

        const tests = [
          `Recommended tests:`,
          `• “Always-on” vs “bursty” campaign pacing; measure stability of sessions and blended CAC.`,
          `• Weekly SEO content cadence vs ad-only baseline; track incremental organic sessions.`,
        ];

        summary = [
          `Timeseries (${granularity || "daily"}) — ${period}`,
          scope,
          ``,
          `Sessions moved ${sDelta >= 0 ? "+" : ""}${sDelta}% from first to last point; Users ${uDelta >= 0 ? "+" : ""}${uDelta}%.`,
          ``,
          `What this suggests:`,
          ...suggests,
          ``,
          tests.join("\n"),
        ].join("\n");
      }

      drivers = [
        {
          theme: "Acquisition",
          label: "Sessions trend",
          metric: "sessions",
          value: series.reduce((max, point) => Math.max(max, point.sessions || 0), 0),
          journey: "Traffic trend",
          insight: `Sessions moved ${sDelta >= 0 ? "+" : ""}${sDelta}% from first to last point.`,
          example: "Traffic spike or dip likely tied to campaign launches, content pushes, or technical incidents.",
        },
        {
          theme: "Content",
          label: "User trend",
          metric: "users",
          value: series.reduce((max, point) => Math.max(max, point.users || 0), 0),
          journey: "Audience engagement",
          insight: `Users moved ${uDelta >= 0 ? "+" : ""}${uDelta}% over the same window.`,
          example: "User growth lags session growth when acquisition brings low-intent visitors.",
        },
      ];
    }

    else if (topic === "campaigns-overview" || topic === "campaign-detail") {
      const suggests = [
        `Focus budget on campaigns with strong session-to-transaction efficiency; cap or pause high-session/low-revenue lines.`,
        `Standardise UTMs; split brand vs non-brand; route brand to high-trust landers, non-brand to education.`,
      ];
      const tests = [
        `Recommended tests:`,
        `• Creative angle test (problem vs proof vs offer); pick winners by CAC/LTV not CTR.`,
        `• Landers by intent: generic PDP vs problem/solution page; measure CVR and engagement.`,
      ];
      summary = [
        `Campaigns (${period})`,
        scope,
        ``,
        `What this suggests:`,
        ...suggests,
        ``,
        tests.join("\n"),
      ].join("\n");

      if (topic === "campaigns-overview") {
        const campaigns = rest.campaigns || [];
        drivers = campaigns.slice(0, 4).map((c, idx) => ({
          theme: "Acquisition",
          label: c.name || `(campaign ${idx + 1})`,
          metric: "sessions",
          value: c.sessions || 0,
          share: null,
          journey: "Campaign mix",
          insight: `${fmtInt(c.sessions)} sessions · ${fmtInt(c.transactions || 0)} transactions · ${fmtGBP(c.revenue || 0)}`,
          example: `Prospect sees ${c.name} creative, lands on campaign page, and ${c.transactions ? "converts" : "drops"}.`,
        }));
      } else if (topic === "campaign-detail") {
        const totals = rest.totals || {};
        drivers = [
          {
            theme: "Acquisition",
            label: rest.campaign || "Campaign",
            metric: "sessions",
            value: totals.sessions || 0,
            journey: "Campaign performance",
            insight: `${fmtInt(totals.sessions)} sessions · ${fmtInt(totals.users)} users · CVR ${(totals.sessions > 0 ? ((totals.transactions || 0) / totals.sessions) * 100 : 0).toFixed(2)}%`,
            example: "Campaign audience clicks through expecting promised offer; conversion hinges on lander relevance.",
          },
        ];
      }
    }

    const finalSummary = finalizeSummary(req, summary, {
      topic: resolvedTopic,
      period,
      scope,
      drivers,
      qualitativeNotes,
    });

    res.status(200).json({ summary: finalSummary });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise: ${String(e?.message || e)}` });
  }
}

export default withUsageGuard("ai", handler);
