// web/pages/api/insights/summarise-pages.js
// Produces a practical, opinionated summary of "Top pages" with concrete tests.
// No GA auth; works entirely on posted rows.

function fmtInt(n) { return Number(n || 0).toLocaleString("en-GB"); }
function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
function topN(arr, n) { return [...(arr || [])].sort((a,b)=> (b.views||0)-(a.views||0)).slice(0,n); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { rows = [], dateRange = {}, filters = {} } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({ summary: "No page rows to summarise for the selected period." });
    }

    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} → ${dateRange.end}` : "the selected period";
    const scope = [
      filters?.country && filters.country !== "All" ? `country = ${filters.country}` : "",
      filters?.channelGroup && filters.channelGroup !== "All" ? `channel = ${filters.channelGroup}` : "",
    ].filter(Boolean).join("; ");
    const scopeLine = scope ? `Filters: ${scope}` : "Filters: none";

    const totalViews = rows.reduce((a, r) => a + (r.views || 0), 0);
    const totalUsers = rows.reduce((a, r) => a + (r.users || 0), 0);

    const leaders = topN(rows, 5);
    const longTail = rows.length > 5 ? rows.length - 5 : 0;
    const topShare = pct(leaders.reduce((a,r)=> a + (r.views||0), 0), totalViews);

    // Heuristics
    const likelyLandingCandidates = leaders.filter(r => String(r.path || "").endsWith("/") || String(r.path || "").split("/").length <= 3);
    const potentialCannibals = leaders.filter(r => /product|category|collection/i.test(r.title || "")).length >= 3;

    const findings = [
      `Top pages (${period})`,
      scopeLine,
      ``,
      `Totals: ${fmtInt(totalViews)} views, ${fmtInt(totalUsers)} users.`,
      `Concentration: Top 5 pages account for ${topShare}% of all views${longTail ? `; ${fmtInt(longTail)} additional pages form the long tail.` : "."}`,
      ``,
      `Leaders:`,
      ...leaders.map((r, i) => `• ${i + 1}. ${r.title || "(untitled)"}  — ${fmtInt(r.views)} views  (${r.path || ""})`),
      ``,
      potentialCannibals ? `Note: multiple high-traffic product/category pages detected. Check for query overlap and cannibalisation.` : ``,
      likelyLandingCandidates.length ? `Landing potential: ${likelyLandingCandidates.length} of the leaders look like key entrance pages; prioritise above-the-fold clarity and speed.` : ``,
    ].filter(Boolean);

    // Actions & tests
    const actions = [
      `Actions that matter:`,
      `• Speed first: optimise leaders for LCP/CLS; uplift on a few high-volume pages moves the whole site.`,
      `• Clarify intent: ensure H1, sub-copy, and primary CTAs match search/user intent on top entries.`,
      `• Internal linking: from top pages to key money pages with descriptive anchors; add related blocks.`,
      `• Reduce pogo-sticking: tighten hero, prune distractions, surface value props and social proof.`,
      `• Schema & titles: review meta titles/descriptions for CTR; add Product/Breadcrumb schema where relevant.`,
    ];

    const tests = [
      `Recommended tests:`,
      `• Hero A/B on top landing page: benefit-led headline vs. feature-led; measure CTR to primary action.`,
      `• Navigation density test on leaders: lean vs. rich menus; measure scroll depth and click-through.`,
      `• Social proof band on top 3 pages: trust badges or review snippet vs. control; measure add-to-cart / enquiry.`,
      `• Content module order: move “Why us” above fold vs. control; measure bounce and CTA clicks.`,
    ];

    const summary = [
      findings.join("\n"),
      ``,
      actions.join("\n"),
      ``,
      tests.join("\n"),
    ].join("\n");

    res.status(200).json({ summary });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise pages: ${String(e?.message || e)}` });
  }
}
