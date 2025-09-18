// /workspaces/insightsgpt/web/pages/api/insights/summarise-ecommerce.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { totals, dateRange } = req.body || {};
    if (!totals || !dateRange) {
      return res.status(400).json({ error: "Missing totals/dateRange" });
    }

    const {
      purchases = 0, revenue = 0, sessions = 0, users = 0,
      clicks = 0, imps = 0, currency = "GBP", aov = 0, cvr = 0, ctr = null,
    } = totals;

    // Keep this server-side simple & robust; you can swap to OpenAI like your other endpoints if desired.
    const lines = [];
    lines.push(`E-commerce overview for ${dateRange.start} to ${dateRange.end}`);
    lines.push(`• Revenue: ${currency} ${revenue.toFixed(2)}  |  Purchases: ${purchases.toLocaleString()}`);
    lines.push(`• AOV: ${currency} ${aov.toFixed(2)}  |  CVR (Purchases/Active Users): ${cvr.toFixed(2)}%`);
    lines.push(`• Sessions: ${sessions.toLocaleString()}  |  Active Users: ${users.toLocaleString()}`);
    if (ctr !== null) lines.push(`• CTR (Ads): ${ctr.toFixed(2)}%  |  Clicks: ${clicks.toLocaleString()}  |  Impressions: ${imps.toLocaleString()}`);

    // Quick suggestions
    const suggestions = [];
    if (aov > 0 && purchases > 0) {
      suggestions.push("Test order value boosters (bundles, free shipping thresholds, post-purchase upsells).");
    }
    if (cvr < 2 && users > 100) {
      suggestions.push("Review checkout friction (payment options, guest checkout, form length, error messages).");
    }
    if (sessions > 0 && purchases === 0) {
      suggestions.push("Check tracking completeness and funnel (view_item → add_to_cart → begin_checkout → purchase).");
    }
    if (ctr !== null && ctr < 1 && imps > 1000) {
      suggestions.push("Tighten ad targeting/creative and align landing pages to intent to lift CTR.");
    }

    if (suggestions.length) {
      lines.push("");
      lines.push("Suggested next actions:");
      suggestions.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }

    return res.status(200).json({ summary: lines.join("\n") });
  } catch (e) {
    return res.status(500).json({ error: "Server error", message: String(e) });
  }
}
