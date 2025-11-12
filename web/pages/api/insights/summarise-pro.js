// web/pages/api/insights/summarise-pro.js
// Generic summariser for multiple topics with concrete, testable recommendations.

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, dateRange = {}, filters = {}, ...rest } = req.body || {};
    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} → ${dateRange.end}` : "the selected period";
    const scope = scopeLine(filters);

    let summary = "Summary generated.";

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
    }

    res.status(200).json({ summary });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise: ${String(e?.message || e)}` });
  }
}
