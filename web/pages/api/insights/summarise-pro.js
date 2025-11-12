// web/pages/api/insights/summarise-pro.js
// Generic catch-all summariser for various panels. No GA auth required.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, ...rest } = req.body || {};
    let summary = "";

    if (topic === "channels") {
      const { rows = [], totals = {}, dateRange = {}, filters = {} } = rest;
      const period = dateRange?.start && dateRange?.end ? `${dateRange.start} to ${dateRange.end}` : "the period";
      const fCountry = filters?.country && filters.country !== "All" ? `, country = ${filters.country}` : "";
      const fChan = filters?.channelGroup && filters.channelGroup !== "All" ? `, channel = ${filters.channelGroup}` : "";
      const applied = fCountry || fChan ? ` (filters: ${[fCountry, fChan].filter(Boolean).map(s => s.replace(/^, /,"")).join("; ")})` : "";
      const top = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0)).slice(0, 3);
      summary = [
        `Traffic by channel for ${period}${applied}:`,
        `• Sessions: ${Number(totals.sessions || 0).toLocaleString()}, Users: ${Number(totals.users || 0).toLocaleString()}.`,
        ...top.map((r, i) => `   ${i + 1}. ${r.channel} — ${r.sessions.toLocaleString()} sessions`),
      ].join("\n");
    } else if (topic === "landing-pages") {
      const { rows = [], dateRange = {}, filters = {} } = rest;
      const period = dateRange?.start && dateRange?.end ? `${dateRange.start} to ${dateRange.end}` : "the period";
      const total = rows.reduce((a, r) => a + (r.sessions || 0), 0);
      const top = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0)).slice(0, 5);
      summary = [
        `Landing pages for ${period}: total ${total.toLocaleString()} sessions.`,
        ...top.map((r, i) => `   ${i + 1}. ${r.landing} — ${r.sessions.toLocaleString()} sessions (${r.source}/${r.medium})`)
      ].join("\n");
    } else if (topic === "products") {
      const { rows = [], dateRange = {} } = rest;
      const period = dateRange?.start && dateRange?.end ? `${dateRange.start} to ${dateRange.end}` : "the period";
      const revenue = rows.reduce((a, r) => a + (r.revenue || 0), 0);
      const top = [...rows].sort((a, b) => (b.revenue || 0) - (a.revenue || 0)).slice(0, 5);
      summary = [
        `Products for ${period}: revenue £${revenue.toFixed(2)}.`,
        ...top.map((r, i) => `   ${i + 1}. ${r.name} — £${(r.revenue || 0).toFixed(2)}; views ${r.views || 0}, carts ${r.carts || 0}, purchases ${r.purchases || 0}`)
      ].join("\n");
    } else if (topic === "timeseries") {
      const { series = [], granularity } = rest;
      if (!series.length) summary = "No timeseries rows to summarise.";
      else {
        const first = series[0], last = series[series.length - 1];
        const delta = (a, b) => (b && a ? ((b - a) / Math.max(1, a)) * 100 : 0);
        const ds = delta(first.sessions, last.sessions);
        summary = `Timeseries (${granularity || "daily"}): sessions moved ${ds >= 0 ? "+" : ""}${ds.toFixed(1)}% from ${first.period} to ${last.period}.`;
      }
    } else if (topic === "campaigns-overview" || topic === "campaign-detail") {
      summary = "Campaigns reviewed. Focus on those with highest revenue and session-to-transaction efficiency.";
    } else {
      summary = "Summary generated.";
    }

    res.status(200).json({ summary });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise: ${String(e?.message || e)}` });
  }
}
