// web/pages/api/insights/summarise-source-medium.js
// Opinionated analysis of sessionSource/sessionMedium distribution with budget/test ideas.

function fmtInt(n) { return Number(n || 0).toLocaleString("en-GB"); }
function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }
function topN(arr, n, key="sessions") { return [...(arr||[])].sort((a,b)=> (b[key]||0)-(a[key]||0)).slice(0,n); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { rows = [], dateRange = {}, filters = {} } = req.body || {};

    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} → ${dateRange.end}` : "the selected period";
    const scope = [
      filters?.country && filters.country !== "All" ? `country = ${filters.country}` : "",
      filters?.channelGroup && filters.channelGroup !== "All" ? `channel = ${filters.channelGroup}` : "",
    ].filter(Boolean).join("; ");
    const scopeLine = scope ? `Filters: ${scope}` : "Filters: none";

    if (!rows.length) {
      return res.status(200).json({ summary: `No source/medium rows for ${period}. ${scopeLine}` });
    }

    const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
    const totalUsers = rows.reduce((a, r) => a + (r.users || 0), 0);
    const leaders = topN(rows, 6, "sessions");
    const leaderLines = leaders.map((r, i) => {
      const share = pct(r.sessions, totalSessions);
      return `• ${i + 1}. ${r.source || "(not set)"} / ${r.medium || "(not set)"} — ${fmtInt(r.sessions)} sessions (${share}%)`;
    });

    const direct = rows.find(r => (r.source || "").toLowerCase() === "(direct)");
    const directShare = pct(direct?.sessions || 0, totalSessions);
    const heavyDirect = directShare >= 40;

    const paidRows = rows.filter(r => /cpc|paid|ppc|display|paid social|paid_shopping|display/i.test(r.medium || ""));
    const paidShare = pct(paidRows.reduce((a,r)=> a + (r.sessions||0),0), totalSessions);

    const untagged = rows.filter(r => (r.source || "").includes("(not set)") || (r.medium || "").includes("(not set)")).slice(0,3);

    const findings = [
      `Traffic by source / medium (${period})`,
      scopeLine,
      ``,
      `Totals: ${fmtInt(totalSessions)} sessions, ${fmtInt(totalUsers)} users.`,
      `Leaders:`,
      ...leaderLines,
      ``,
      heavyDirect ? `Risk: Direct share is high (${directShare}%). This often masks branded search, bookmarks, or weak UTM hygiene.` : ``,
      paidRows.length ? `Paid share: ${paidShare}% of sessions appear to be paid media. Validate ROAS and incrementality.` : ``,
      untagged.length ? `Tagging hygiene: ${untagged.length} rows include “(not set)”. Review UTMs and auto-tagging.` : ``,
    ].filter(Boolean);

    const actions = [
      `Actions that matter:`,
      `• Diversify mix: reduce over-dependency on Direct by strengthening SEO and creator/affiliate traffic.`,
      `• UTM hygiene: enforce a canonical set (source, medium, campaign, content, term); block “(not set)”.`,
      `• Creator/Affiliate: seed 10–20 micro-creators; track with unique codes and content UTMs.`,
      `• Partnerships/Referral: convert top referrers into formal partnerships or content swaps.`,
    ];

    const tests = [
      `Recommended tests:`,
      `• Paid search: split brand vs non-brand landing experiences; measure incremental revenue uplift.`,
      `• Organic CTR: rewrite meta titles for top 10 keywords; track CTR and session lift.`,
      `• Affiliate landing: creator-specific lander vs. generic PDP; measure AOV and conversion.`,
      `• Social ad hook: 3x creative angles (problem, social proof, offer) across 2 audiences; pick winners by CAC/LTV.`,
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
    res.status(200).json({ summary: `Unable to summarise source/medium: ${String(e?.message || e)}` });
  }
}
