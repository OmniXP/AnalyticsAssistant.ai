// /workspaces/insightsgpt/web/pages/api/insights/summarise-campaigns.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { rows = [], dateRange = {}, filters = {} } = req.body || {};

    // rows: [{ campaign, sessions, users }]
    const totalSessions = rows.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
    const totalUsers = rows.reduce((a, r) => a + (Number(r.users) || 0), 0);

    const sorted = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
    const top = sorted.slice(0, 5);

    const lines = [];
    lines.push(`Campaign performance ${dateRange.start || "?"} → ${dateRange.end || "?"}.`);
    if (filters?.country && filters.country !== "All") lines.push(`Country filter: ${filters.country}.`);
    if (filters?.channelGroup && filters.channelGroup !== "All") lines.push(`Channel group filter: ${filters.channelGroup}.`);
    lines.push(`Total sessions: ${totalSessions.toLocaleString()} · Total users: ${totalUsers.toLocaleString()}`);

    if (top.length) {
      lines.push(`Top campaigns by sessions:`);
      top.forEach((r, i) => {
        const share = totalSessions ? Math.round((r.sessions / totalSessions) * 100) : 0;
        lines.push(`${i + 1}. ${r.campaign} — ${r.sessions.toLocaleString()} sessions (${share}%), ${r.users.toLocaleString()} users`);
      });
    } else {
      lines.push(`No campaign rows in this range.`);
    }

    // 2 quick hypotheses/tests
    lines.push(`\nSuggested tests:`);
    lines.push(`• Expand the best performer’s reach: replicate ${top[0]?.campaign || "top campaign"} targeting across an additional channel where relevant.`);
    lines.push(`• Improve underperformers: pause bottom 20% of campaigns by session share and reallocate to top performers for 2 weeks; measure lift in sessions and CPC.`);

    return res.status(200).json({ summary: lines.join("\n") });
  } catch (err) {
    return res.status(500).json({ error: "Failed to summarise campaigns", details: String(err?.message || err) });
  }
}
