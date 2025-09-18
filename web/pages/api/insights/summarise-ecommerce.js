// /workspaces/insightsgpt/web/pages/api/insights/summarise-ecommerce.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let body = null;
  try {
    // In Next.js API routes, req.body is already parsed if header is application/json.
    // But we'll be defensive in case it's a raw string.
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { totals, dateRange } = body;

  // Extra logging to help debugging (visible in Vercel logs / local terminal)
  console.log("[summarise-ecommerce] received:", {
    hasTotals: !!totals,
    hasDateRange: !!dateRange,
    dateRange,
    totalsKeys: totals && Object.keys(totals),
  });

  if (!totals || !dateRange) {
    return res.status(400).json({ error: "Missing totals/dateRange" });
  }

  try {
    const {
      purchases = 0, revenue = 0, sessions = 0, users = 0,
      clicks = 0, imps = 0, currency = "GBP", aov = 0, cvr = 0, ctr = null,
    } = totals;

    const lines = [];
    lines.push(`E-commerce overview for ${dateRange.start} to ${dateRange.end}`);
    lines.push(`• Revenue: ${currency} ${Number(revenue).toFixed(2)}  |  Purchases: ${Number(purchases).toLocaleString()}`);
    lines.push(`• AOV: ${currency} ${Number(aov).toFixed(2)}  |  CVR (Purchases/Active Users): ${Number(cvr).toFixed(2)}%`);
    lines.push(`• Sessions: ${Number(sessions).toLocaleString()}  |  Active Users: ${Number(users).toLocaleString()}`);
    if (ctr !== null) {
      lines.push(`• CTR (Ads): ${Number(ctr).toFixed(2)}%  |  Clicks: ${Number(clicks).toLocaleString()}  |  Impressions: ${Number(imps).toLocaleString()}`);
    }

    const suggestions = [];
    if (aov > 0 && purchases > 0) suggestions.push("Test bundles, free-shipping thresholds, and post-purchase upsells to lift AOV.");
    if (cvr < 2 && users > 100) suggestions.push("Reduce checkout friction (guest checkout, payment options, form length, clear errors).");
    if (sessions > 0 && purchases === 0) suggestions.push("Check tracking and funnel integrity (view_item → add_to_cart → begin_checkout → purchase).");
    if (ctr !== null && ctr < 1 && imps > 1000) suggestions.push("Improve ad targeting/creative and align landing pages to intent.");

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
