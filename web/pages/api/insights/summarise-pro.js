// /workspaces/insightsgpt/web/pages/api/insights/summarise-pro.js
// Pro summaries for multiple topics: checkout funnel, channels, source/medium, pages, ecom KPIs.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const {
      topic = "checkout_funnel",
      // common
      dateRange = {},
      filters = {},
      targets = {},
      // topic-specific payloads
      steps = {},              // checkout_funnel
      rates = {},              // checkout_funnel
      rows = [],               // channels | source_medium | pages (array of parsed rows from your UI)
      totals = {},             // channels | ecom_kpis
      currency = "GBP",        // ecom_kpis formatting
    } = req.body || {};

    const rng = `${dateRange?.start || "?"} → ${dateRange?.end || "?"}`;
    const filtParts = [];
    if (filters?.country && filters.country !== "All") filtParts.push(`Country: ${filters.country}`);
    if (filters?.channelGroup && filters.channelGroup !== "All") filtParts.push(`Channel Group: ${filters.channelGroup}`);
    const filtText = filtParts.length ? ` (filters: ${filtParts.join(" · ")})` : "";

    const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}%` : "0.00%");
    const num = (n) => (Number.isFinite(n) ? n.toLocaleString() : "0");
    const money = (n) =>
      new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number.isFinite(n) ? n : 0);

    let summary = "";

    /* ---------- Topic: Checkout Funnel ---------- */
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

      const weakest =
        Math.min(gaps.c2c, gaps.c2p, gaps.cart2p) === gaps.c2p
          ? "Checkout → Purchase"
          : Math.min(gaps.c2c, gaps.c2p, gaps.cart2p) === gaps.c2c
          ? "Cart → Checkout"
          : "Cart → Purchase";

      summary = [
        `**Checkout funnel** ${rng}${filtText}`,
        "",
        `**Volumes**`,
        `• Add to cart: ${num(add_to_cart)}  |  Begin checkout: ${num(begin_checkout)}  |  Purchases: ${num(purchase)}`,
        "",
        `**Conversion rates**`,
        `• Cart → Checkout: ${pct(cart_to_checkout_pct)} ${badge(cart_to_checkout_pct, tgtC2C)} (target ${tgtC2C}%)`,
        `• Checkout → Purchase: ${pct(checkout_to_purchase_pct)} ${badge(checkout_to_purchase_pct, tgtC2P)} (target ${tgtC2P}%)`,
        `• Cart → Purchase: ${pct(cart_to_purchase_pct)} ${badge(cart_to_purchase_pct, tgtCart2P)} (target ${tgtCart2P}%)`,
        "",
        `**Biggest drag on revenue:** ${weakest}.`,
        "",
        `**Hypotheses & tests**`,
        `1) **Payment friction** → add 1-click wallets; surface wallets earlier; reduce field count.`,
        `2) **Shipping surprise** → show cost & ETA pre-checkout; default best-value option.`,
        `3) **Cart intent** weak → reinforce value (returns, guarantees), simplify cart UI, avoid distractions.`,
        "",
        `**Next actions**`,
        `• Prioritise one test for the weakest step; run for 2 weeks or until 95% power.`,
      ].join("\n");
    }

    /* ---------- Topic: Channels (Default Channel Group) ---------- */
    else if (topic === "channels") {
      // rows expected: [{ channel, sessions, users }]
      const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
      const totalUsers = rows.reduce((a, r) => a + (r.users || 0), 0);
      const top3 = [...rows].slice(0, 3);
      const topList =
        top3.length > 0
          ? top3.map((r, i) => `   ${i + 1}. ${r.channel} — ${num(r.sessions)} sessions`).join("\n")
          : "   No channels in range.";

      const top = rows[0];
      const topShare = top && totalSessions ? Math.round((top.sessions / totalSessions) * 100) : 0;

      summary = [
        `**Traffic by Channel** ${rng}${filtText}`,
        "",
        `**Totals**  Sessions: ${num(totalSessions)}  ·  Users: ${num(totalUsers)}`,
        top ? `**Top channel:** ${top.channel} (${topShare}% of sessions)` : "",
        "",
        `**Leaders**`,
        topList,
        "",
        `**Opportunities**`,
        `• If ${top ? top.channel : "top channels"} dominate, consider diversifying via SEO content, paid retargeting, or email lifecycle.`,
        `• Underperforming channels with some users (but low sessions) may benefit from remarketing/audiences.`,
        "",
        `**Quick tests**`,
        `• Add 1–2 targeted landing pages for the strongest channel intent.`,
        `• Trial a modest budget to boost the runner-up channel; measure incremental sessions & CVR.`,
      ].filter(Boolean).join("\n");
    }

    /* ---------- Topic: Source / Medium ---------- */
    else if (topic === "source_medium") {
      // rows expected: [{ source, medium, sessions, users }]
      const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
      const sorted = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
      const top5 = sorted.slice(0, 5);
      const lines =
        top5.length > 0
          ? top5.map((r, i) => {
              const share = totalSessions ? ((r.sessions / totalSessions) * 100).toFixed(1) : "0.0";
              return `   ${i + 1}. ${r.source} / ${r.medium} — ${num(r.sessions)} sessions (${share}%)`;
            }).join("\n")
          : "   No sources in range.";

      summary = [
        `**Source / Medium** ${rng}${filtText}`,
        "",
        `**Top sources**`,
        lines,
        "",
        `**Recommendations**`,
        `• Double-down on the top 1–2 sources with intent-matched landing pages.`,
        `• For low-share sources with solid user counts, try audience lookalikes or UTM hygiene to capture true performance.`,
        "",
        `**Tests**`,
        `• A/B headlines & hero on the top source’s LP to lift CVR.`,
        `• Tighten UTMs (utm_source / utm_medium / utm_campaign) and audit for “(not set)” traffic.`,
      ].join("\n");
    }

    /* ---------- Topic: Pages ---------- */
    else if (topic === "pages") {
      // rows expected: [{ title, path, views, users }]
      const totalViews = rows.reduce((a, r) => a + (r.views || 0), 0);
      const top5 = [...rows].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
      const lines =
        top5.length > 0
          ? top5.map((r, i) => {
              const share = totalViews ? ((r.views / totalViews) * 100).toFixed(1) : "0.0";
              return `   ${i + 1}. ${r.title || r.path} — ${num(r.views)} views (${share}%)`;
            }).join("\n")
          : "   No pages in range.";

      summary = [
        `**Top Pages** ${rng}${filtText}`,
        "",
        `**Leaders**`,
        lines,
        "",
        `**Page improvement ideas**`,
        `• Improve above-the-fold clarity (headline/value/CTA).`,
        `• Add internal links from top pages to commercial pages.`,
        `• Test intent-matched CTAs for organic pages with high views but low engagement.`,
      ].join("\n");
    }

    /* ---------- Topic: E-commerce KPIs ---------- */
    else if (topic === "ecom_kpis") {
      // totals expected: { sessions, users, addToCarts, beginCheckout, transactions, revenue, cvr, aov }
      const s = totals || {};
      summary = [
        `**E-commerce KPIs** ${rng}${filtText}`,
        "",
        `**Core metrics**`,
        `• Sessions: ${num(s.sessions)}  |  Users: ${num(s.users)}`,
        `• Add-to-cart: ${num(s.addToCarts)}  |  Begin checkout: ${num(s.beginCheckout)}`,
        `• Transactions: ${num(s.transactions)}  |  Revenue: ${money(s.revenue)}`,
        "",
        `**Ratios**`,
        `• CVR (purchase / session): ${pct(Number(s.cvr || 0))}`,
        `• AOV (Revenue / Transactions): ${money(Number(s.aov || 0))}`,
        "",
        `**Hypotheses & tests**`,
        `1) **AOV uplift** — Try bundles/threshold offers (e.g., free shipping over £X).`,
        `2) **CVR uplift** — Reduce PDP friction (fast images, trust badges, concise copy).`,
        `3) **Cart stage** — Exit intent offer for at-risk carts; test microcopy on fees/returns.`,
      ].join("\n");
    }

    else {
      summary = `Summary for ${topic} ${rng}${filtText}`;
    }

    return res.status(200).json({ summary });
  } catch (err) {
    console.error("summarise-pro error", err);
    return res.status(500).json({ error: "Server error in summarise-pro" });
  }
}
