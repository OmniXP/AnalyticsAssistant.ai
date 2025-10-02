// /workspaces/insightsgpt/web/pages/api/insights/summarise-pro.js
// Lightweight “Pro” summariser for Checkout Funnel and other topics.
// No external API calls — it formats the payload you already send.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    // Make the 405 helpful
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const {
      topic = "checkout_funnel",
      steps = {},
      rates = {},
      dateRange = {},
      filters = {},
      targets = {},
    } = req.body || {};

    // Basic shaping
    const rng = `${dateRange?.start || "?"} → ${dateRange?.end || "?"}`;
    const filtParts = [];
    if (filters?.country && filters.country !== "All") filtParts.push(`Country: ${filters.country}`);
    if (filters?.channelGroup && filters.channelGroup !== "All") filtParts.push(`Channel Group: ${filters.channelGroup}`);
    const filtText = filtParts.length ? ` (filters: ${filtParts.join(" · ")})` : "";

    // Helper
    const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}%` : "0.00%");
    const num = (n) => (Number.isFinite(n) ? n.toLocaleString() : "0");

    let summary = "";

    if (topic === "checkout_funnel") {
      const {
        add_to_cart = 0,
        begin_checkout = 0,
        add_shipping_info = 0,
        add_payment_info = 0,
        purchase = 0,
      } = steps;

      const {
        cart_to_checkout_pct = 0,
        checkout_to_purchase_pct = 0,
        cart_to_purchase_pct = 0,
      } = rates;

      const tgtC2C = Number(targets?.cart_to_checkout_pct ?? 40);
      const tgtC2P = Number(targets?.checkout_to_purchase_pct ?? 25);
      const tgtCart2P = Number(targets?.cart_to_purchase_pct ?? 10);

      const gap = (actual, target) => (Number.isFinite(actual) ? +(actual - target).toFixed(2) : -target);
      const badge = (actual, target) => (actual >= target ? "✅" : "⚠️");

      const gaps = {
        c2c: gap(cart_to_checkout_pct, tgtC2C),
        c2p: gap(checkout_to_purchase_pct, tgtC2P),
        cart2p: gap(cart_to_purchase_pct, tgtCart2P),
      };

      summary = [
        `**Checkout funnel summary** ${rng}${filtText}`,
        "",
        `**Volumes**`,
        `• Add to cart: ${num(add_to_cart)}  |  Begin checkout: ${num(begin_checkout)}  |  Purchases: ${num(purchase)}`,
        "",
        `**Conversion rates**`,
        `• Cart → Checkout: ${pct(cart_to_checkout_pct)} ${badge(cart_to_checkout_pct, tgtC2C)} (target ${tgtC2C}%)`,
        `• Checkout → Purchase: ${pct(checkout_to_purchase_pct)} ${badge(checkout_to_purchase_pct, tgtC2P)} (target ${tgtC2P}%)`,
        `• Cart → Purchase: ${pct(cart_to_purchase_pct)} ${badge(cart_to_purchase_pct, tgtCart2P)} (target ${tgtCart2P}%)`,
        "",
        `**What’s holding back revenue?**`,
        `• Biggest gap vs target: ${
          Math.min(gaps.c2c, gaps.c2p, gaps.cart2p) === gaps.c2p
            ? "Checkout → Purchase"
            : Math.min(gaps.c2c, gaps.c2p, gaps.cart2p) === gaps.c2c
            ? "Cart → Checkout"
            : "Cart → Purchase"
        } (${Math.min(gaps.c2c, gaps.c2p, gaps.cart2p)}pp).`,
        "",
        `**Hypotheses & tests**`,
        `1) **Payment friction** is depressing Checkout → Purchase.\n   • Test: add 1-click wallet (Apple/Google Pay) or move wallets higher in the list.\n   • Metric to watch: checkout_to_purchase_pct`,
        `2) **Shipping surprise** at checkout.\n   • Test: expose shipping cost/ETA earlier (cart & PDP); default cheapest option.\n   • Metric to watch: checkout_to_purchase_pct`,
        `3) **Weak cart intent** (Cart → Checkout below target).\n   • Test: stronger value cues in cart (returns, guarantees), reduce distractions, persistent promo messaging.\n   • Metric to watch: cart_to_checkout_pct`,
        "",
        `**Quick wins**`,
        `• Autofill address & email where possible.\n• Fewer form fields (only essentials).`,
        "",
        `**Next actions**`,
        `• Prioritise one test for each weakest step; run for 2 weeks or until 95% stat. power.`,
      ].join("\n");
    } else {
      // Fallback for any future topic
      summary = `Summary for ${topic} ${rng}${filtText}`;
    }

    return res.status(200).json({ summary });
  } catch (err) {
    console.error("summarise-pro error", err);
    return res.status(500).json({ error: "Server error in summarise-pro" });
  }
}
