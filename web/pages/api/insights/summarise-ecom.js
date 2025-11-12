// web/pages/api/insights/summarise-ecom.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { totals = {}, dateRange = {}, filters = {} } = req.body || {};
    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} to ${dateRange.end}` : "the selected period";
    const fCountry = filters?.country && filters.country !== "All" ? `, country = ${filters.country}` : "";
    const fChan = filters?.channelGroup && filters.channelGroup !== "All" ? `, channel = ${filters.channelGroup}` : "";
    const applied = fCountry || fChan ? ` (filters: ${[fCountry, fChan].filter(Boolean).map(s => s.replace(/^, /,"")).join("; ")})` : "";

    const lines = [
      `E-commerce performance for ${period}${applied}:`,
      `• Sessions: ${Number(totals.sessions || 0).toLocaleString()}, Users: ${Number(totals.users || 0).toLocaleString()}.`,
      `• Purchases: ${Number(totals.transactions || 0).toLocaleString()}, Revenue: £${Number(totals.revenue || 0).toFixed(2)}.`,
      `• CVR: ${(Number(totals.cvr || 0)).toFixed(2)}%, AOV: £${Number(totals.aov || 0).toFixed(2)}.`,
      `• Funnel taps: add_to_cart ${Number(totals.addToCarts || 0).toLocaleString()}, checkouts ${Number(totals.beginCheckout || 0).toLocaleString()}.`,
    ];
    res.status(200).json({ summary: lines.join("\n") });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise e-commerce: ${String(e?.message || e)}` });
  }
}
