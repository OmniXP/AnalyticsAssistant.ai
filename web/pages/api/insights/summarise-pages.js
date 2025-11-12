// web/pages/api/insights/summarise-pages.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { rows = [], dateRange = {}, filters = {} } = req.body || {};
    if (!Array.isArray(rows)) return res.status(200).json({ summary: "No rows to summarise." });

    const totalViews = rows.reduce((a, r) => a + (r.views || 0), 0);
    const totalUsers = rows.reduce((a, r) => a + (r.users || 0), 0);
    const top = [...rows].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} to ${dateRange.end}` : "the selected period";
    const fCountry = filters?.country && filters.country !== "All" ? `, country = ${filters.country}` : "";
    const fChan = filters?.channelGroup && filters.channelGroup !== "All" ? `, channel = ${filters.channelGroup}` : "";
    const applied = fCountry || fChan ? ` (filters: ${[fCountry, fChan].filter(Boolean).map(s => s.replace(/^, /,"")).join("; ")})` : "";

    const lines = [
      `Top pages for ${period}${applied}:`,
      `• Total views: ${totalViews.toLocaleString()}, Total users: ${totalUsers.toLocaleString()}.`,
      `• Leaders:`,
      ...top.map((r, i) => `   ${i + 1}. ${r.title || "(untitled)"} — ${r.views?.toLocaleString?.() || r.views} views`),
      top.length < rows.length ? `• ${rows.length - top.length} additional pages trail the leaders.` : ``,
    ].filter(Boolean);

    res.status(200).json({ summary: lines.join("\n") });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise pages: ${String(e?.message || e)}` });
  }
}
