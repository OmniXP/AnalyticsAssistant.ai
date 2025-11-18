// /workspaces/insightsgpt/web/pages/api/insights/summarise-campaigns.js
import { finalizeSummary } from "../../../lib/insights/ai-pro.js";
import { withUsageGuard } from "../../../server/usage-limits.js";

function scopeLine(filters = {}) {
  const parts = [];
  if (filters?.country && filters.country !== "All") parts.push(`country = ${filters.country}`);
  if (filters?.channelGroup && filters.channelGroup !== "All") parts.push(`channel = ${filters.channelGroup}`);
  return parts.length ? parts.join("; ") : "none";
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { rows = [], dateRange = {}, filters = {}, qualitativeNotes = "" } = req.body || {};

    // rows: [{ campaign, sessions, users }]
    const totalSessions = rows.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
    const totalUsers = rows.reduce((a, r) => a + (Number(r.users) || 0), 0);

    const sorted = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
    const top = sorted.slice(0, 5);

    const lines = [];
    const period =
      dateRange?.start && dateRange?.end ? `${dateRange.start} → ${dateRange.end}` : "selected period";
    const scope = scopeLine(filters);

    lines.push(`Campaign performance ${period}.`);
    lines.push(`Filters: ${scope}.`);
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
    lines.push(
      `• Expand the best performer’s reach: replicate ${top[0]?.campaign || "top campaign"} targeting across an additional channel where relevant.`
    );
    lines.push(`• Improve underperformers: pause bottom 20% of campaigns by session share and reallocate to top performers for 2 weeks; measure lift in sessions and CPC.`);

    const drivers = top.map((r, idx) => {
      const share = totalSessions ? Math.round((Number(r.sessions || 0) / totalSessions) * 100) : null;
      return {
        theme: "Acquisition",
        label: r.campaign || `(row ${idx + 1})`,
        metric: "sessions",
        value: Number(r.sessions || 0),
        share,
        change: idx === 0 ? "Primary driver" : null,
        journey: "Campaign → Landing",
        insight: `${Number(r.sessions || 0).toLocaleString("en-GB")} sessions${share != null ? ` (${share}%)` : ""}`,
        example: `A user clicks ${r.campaign || "the creative"}, lands on the campaign LP, and decides within seconds if the promise matches the offer.`,
      };
    });

    const summary = finalizeSummary(req, lines.join("\n"), {
      topic: "campaigns",
      period,
      scope,
      drivers,
      qualitativeNotes,
    });

    return res.status(200).json({ summary });
  } catch (err) {
    return res.status(500).json({ error: "Failed to summarise campaigns", details: String(err?.message || err) });
  }
}

export default withUsageGuard("ai", handler);
