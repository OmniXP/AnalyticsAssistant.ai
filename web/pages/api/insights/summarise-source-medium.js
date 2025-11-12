// web/pages/api/insights/summarise-source-medium.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { rows = [], dateRange = {}, filters = {} } = req.body || {};
    const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
    const totalUsers = rows.reduce((a, r) => a + (r.users || 0), 0);
    const top = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0)).slice(0, 5);

    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} to ${dateRange.end}` : "the selected period";
    const fCountry = filters?.country && filters.country !== "All" ? `, country = ${filters.country}` : "";
    const fChan = filters?.channelGroup && filters.channelGroup !== "All" ? `, channel = ${filters.channelGroup}` : "";
    const applied = fCountry || fChan ? ` (filters: ${[fCountry, fChan].filter(Boolean).map(s => s.replace(/^, /,"")).join("; ")})` : "";

    const lines = [
      `Traffic by source/medium for ${period}${applied}:`,
      `• Total sessions: ${totalSessions.toLocaleString()}, users: ${totalUsers.toLocaleString()}.`,
      ...top.map((r, i) => {
        const share = totalSessions ? Math.round((r.sessions / totalSessions) * 100) : 0;
        return `   ${i + 1}. ${r.source || "(not set)"} / ${r.medium || "(not set)"} — ${r.sessions.toLocaleString()} sessions (${share}% share)`;
      }),
      rows.length === 0 ? `• No rows returned. Check date range and GA attribution.` : ``,
    ].filter(Boolean);

    res.status(200).json({ summary: lines.join("\n") });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise source/medium: ${String(e?.message || e)}` });
  }
}
