// /pages/api/insights/summarise-pro.js
// Pro summaries for multiple topics used by the dashboard UI.
// Backward compatible: accepts both `topic` and `kind`.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const body = req.body || {};

    // ---- Back-compat: support both `topic` and `kind` ----
    const topic =
      body.topic ||
      body.kind ||
      "checkout_funnel";

    // ---- Common fields across topics ----
    const dateRange = body.dateRange || {};
    const filters = body.filters || {};
    const targets = body.targets || {};
    const currency = body.currency || "GBP";

    // ---- Topic-specific fields (optional) ----
    const steps = body.steps || {};         // checkout_funnel
    const rates = body.rates || {};         // checkout_funnel
    const rows = Array.isArray(body.rows) ? body.rows : []; // channels/source_medium/pages/landing/products etc.
    const totals = body.totals || {};       // channels/ecom_kpis/campaign-detail totals
    const series = Array.isArray(body.series) ? body.series : []; // timeseries
    const granularity = body.granularity || "daily";              // timeseries
    const anomalies = Array.isArray(body.anomalies) ? body.anomalies : []; // anomaly-alerts
    const campaigns = Array.isArray(body.campaigns) ? body.campaigns : []; // campaigns-overview
    const breakdowns = body.breakdowns || {}; // campaign-detail { sourceMedium, adContent, term }
    const campaign = body.campaign || "";     // campaign-detail
    const topicLabel = body.topic || body.kind || "topic";

    // ---- Helpers ----
    const rng = `${dateRange?.start || "?"} → ${dateRange?.end || "?"}`;
    const filtParts = [];
    if (filters?.country && filters.country !== "All") filtParts.push(`Country: ${filters.country}`);
    if (filters?.channelGroup && filters.channelGroup !== "All") filtParts.push(`Channel Group: ${filters.channelGroup}`);
    const filtText = filtParts.length ? ` (filters: ${filtParts.join(" · ")})` : "";

    const pct = (n, digits = 2) => (Number.isFinite(n) ? `${n.toFixed(digits)}%` : "0.00%");
    const num = (n) => (Number.isFinite(n) ? Number(n).toLocaleString() : "0");
    const money = (n) =>
      new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number.isFinite(n) ? Number(n) : 0);

    const clamp = (s, max = 6000) => {
      const str = String(s || "");
      return str.length > max ? `${str.slice(0, max - 1)}…` : str;
    };

    const fmtList = (items) => (items && items.length ? items.join("\n") : "—");

    // Small utility for ranking and safe share
    const safeShare = (part, whole, digits = 1) =>
      Number(whole) > 0 ? ((Number(part) / Number(whole)) * 100).toFixed(digits) : "0.0";

    // ---- Compose summary depending on topic ----
    let summary = "";

    /* =========================================================================
       Anomaly Alerts
       ====================================================================== */
    if (topic === "anomaly-alerts") {
      // anomalies: [{ metric, date, value, z, mean, std }]
      const top = [...anomalies].sort((a, b) => Math.abs(b?.z || 0) - Math.abs(a?.z || 0)).slice(0, 10);
      const pos = top.filter((a) => (a?.z || 0) > 0);
      const neg = top.filter((a) => (a?.z || 0) < 0);

      const lines = top.map((a, i) => {
        const dir = (a?.z || 0) >= 0 ? "+" : "−";
        const zAbs = Math.abs(a?.z || 0).toFixed(2);
        return `   ${i + 1}. ${a?.metric || "Metric"} ${dir}${zAbs}σ on ${a?.date || "—"} — value ${num(a?.value || 0)} (μ=${num(a?.mean || 0)}, σ=${num(a?.std || 0)})`;
      });

      // Simple heuristics to generate hypotheses/actions
      const metricsHit = new Set(top.map((a) => a?.metric).filter(Boolean));
      const h = [];
      const a = [];

      if (metricsHit.has("SESSIONS")) {
        h.push("Traffic mix shift (e.g., Paid burst, seasonal spike, referral).");
        a.push("Drill into Source/Medium and Top Campaigns on the anomalous dates; validate UTMs and budgets.");
      }
      if (metricsHit.has("REVENUE")) {
        h.push("Promotion/stock effect or checkout issues impacted revenue disproportionately to sessions.");
        a.push("Check AOV and funnel steps on those days; confirm promo codes, pricing, and payment uptime.");
      }
      if (metricsHit.has("CVR")) {
        h.push("UX or intent change (landing quality, page speed, PDP availability) altered conversion rate.");
        a.push("Compare landing pages and device split; run a speed audit and review key PDPs for OOS or errors.");
      }
      if (!h.length) {
        h.push("Data volatility or low volume created statistical outliers.");
        a.push("Aggregate to weekly granularity for validation, then backtrack to daily for the exact cause.");
      }

      summary = [
        `**Anomaly Alerts** ${rng}${filtText}`,
        "",
        anomalies.length ? `**Top anomalies (by |z|)**` : "No anomalies detected in range.",
        anomalies.length ? lines.join("\n") : "",
        anomalies.length ? "" : "",
        anomalies.length ? `**Interpretation**` : "",
        anomalies.length ? `• Positive (spikes): ${pos.length}  ·  Negative (dips): ${neg.length}` : "",
        anomalies.length ? `• Metrics impacted: ${[...metricsHit].join(", ") || "—"}` : "",
        anomalies.length ? "" : "",
        anomalies.length ? `**Hypotheses**` : "",
        anomalies.length ? fmtList(h.map((x, i) => `${i + 1}) ${x}`)) : "",
        anomalies.length ? "" : "",
        anomalies.length ? `**Next actions (do now)**` : "",
        anomalies.length ? fmtList(a.map((x) => `• ${x}`)) : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    /* =========================================================================
       Timeseries (daily / weekly)
       ====================================================================== */
    else if (topic === "timeseries") {
      // series: [{ period, sessions, users, transactions, revenue }]
      const s = series || [];
      const totalSessions = s.reduce((acc, r) => acc + (Number(r.sessions) || 0), 0);
      const totalRevenue = s.reduce((acc, r) => acc + (Number(r.revenue) || 0), 0);

      const first = s[0] || {};
      const last = s[s.length - 1] || {};
      const sessionsTrend =
        Number(first.sessions) > 0 ? ((Number(last.sessions || 0) - Number(first.sessions || 0)) / Number(first.sessions)) * 100 : 0;

      // Biggest single-day (or week) change by absolute delta sessions
      let biggest = null;
      for (let i = 1; i < s.length; i++) {
        const delta = Number(s[i].sessions || 0) - Number(s[i - 1].sessions || 0);
        if (!biggest || Math.abs(delta) > Math.abs(biggest.delta)) {
          biggest = { period: s[i].period, delta };
        }
      }

      // Quick volatility heuristic (population std / mean)
      const sessVals = s.map((d) => Number(d.sessions) || 0);
      const mean = sessVals.length ? sessVals.reduce((a, b) => a + b, 0) / sessVals.length : 0;
      const variance = sessVals.length ? sessVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sessVals.length : 0;
      const std = Math.sqrt(variance);
      const volatility = mean > 0 ? (std / mean) * 100 : 0;

      const parts = [
        `**Traffic over time (${granularity})** ${rng}${filtText}`,
        "",
        `**Totals**  Sessions: ${num(totalSessions)}  ·  Revenue: ${money(totalRevenue)}`,
        `**Trend**  Sessions change from first to last point: ${sessionsTrend >= 0 ? "+" : ""}${sessionsTrend.toFixed(1)}%`,
        biggest ? `**Largest ${granularity} change**  ${biggest.delta >= 0 ? "+" : ""}${num(biggest.delta)} sessions on ${biggest.period}` : "",
        `**Volatility**  ${volatility.toFixed(1)}% (std/mean)`,
        "",
        `**Insights**`,
        `• If volatility is high, consider weekly aggregation and anomaly alerts to isolate drivers.`,
        `• Correlate spikes with campaigns or content drops; dips with site issues or seasonality.`,
        "",
        `**Actions**`,
        `• For positive spikes: replicate the acquisition mix and LPs used on those dates.`,
        `• For negative dips: check status pages, page speed, and ad delivery; consider protective bidding rules.`,
      ].filter(Boolean);

      summary = parts.join("\n");
    }

    /* =========================================================================
       Campaigns Overview
       ====================================================================== */
    else if (topic === "campaigns-overview") {
      // campaigns: [{ name, sessions, users, transactions, revenue, cvr, aov }]
      const list = campaigns || [];
      const totalRev = list.reduce((a, r) => a + (Number(r.revenue) || 0), 0);
      const totalSess = list.reduce((a, r) => a + (Number(r.sessions) || 0), 0);

      const topByRev = [...list].sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)).slice(0, 5);
      const topLines = topByRev.map(
        (r, i) =>
          `   ${i + 1}. ${r.name || "(not set)"} — ${money(r.revenue || 0)} · Sessions ${num(r.sessions || 0)} · CVR ${pct(Number(r.cvr || 0))} · AOV ${money(r.aov || 0)}`
      );

      const weakCVR = [...list].filter((r) => Number(r.sessions || 0) > 0 && Number(r.cvr || 0) < 1).slice(0, 3);
      const weakLines = weakCVR.map(
        (r) => `   • ${r.name || "(not set)"} — ${num(r.sessions || 0)} sessions, CVR ${pct(Number(r.cvr || 0))}`
      );

      summary = [
        `**Campaigns (overview)** ${rng}${filtText}`,
        "",
        `**Totals**  Revenue: ${money(totalRev)}  ·  Sessions: ${num(totalSess)}`,
        "",
        `**Top by revenue**`,
        topLines.length ? topLines.join("\n") : "   No campaigns in range.",
        "",
        `**Low CVR (quick wins)**`,
        weakLines.length ? weakLines.join("\n") : "   None detected.",
        "",
        `**Actions**`,
        `• Allocate budget to the top 1–2 campaigns with headroom; clone LP patterns.`,
        `• For low-CVR campaigns, fix LP-message match and add social proof; tighten audience/keywords.`,
      ].join("\n");
    }

    /* =========================================================================
       Campaign Detail
       ====================================================================== */
    else if (topic === "campaign-detail") {
      // totals: { sessions, users, transactions, revenue }, breakdowns: { sourceMedium, adContent, term }
      const t = totals || {};
      const sm = Array.isArray(breakdowns.sourceMedium) ? breakdowns.sourceMedium : [];
      const ac = Array.isArray(breakdowns.adContent) ? breakdowns.adContent : [];
      const tm = Array.isArray(breakdowns.term) ? breakdowns.term : [];

      const cvr =
        Number(t.sessions) > 0 ? (Number(t.transactions || 0) / Number(t.sessions || 0)) * 100 : 0;
      const aov =
        Number(t.transactions) > 0 ? Number(t.revenue || 0) / Number(t.transactions || 0) : 0;

      const topSM = [...sm]
        .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
        .slice(0, 3)
        .map((r, i) => `   ${i + 1}. ${r.d1 || "(source)"} / ${r.d2 || "(medium)"} — Rev ${money(r.revenue || 0)} · CVR ${pct(safeRate(r.transactions, r.sessions))}`);

      const topContent = [...ac]
        .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
        .slice(0, 3)
        .map((r, i) => `   ${i + 1}. ${r.content || "(not set)"} — Rev ${money(r.revenue || 0)} · CVR ${pct(safeRate(r.transactions, r.sessions))}`);

      const topTerm = [...tm]
        .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
        .slice(0, 3)
        .map((r, i) => `   ${i + 1}. ${r.term || "(not set)"} — Rev ${money(r.revenue || 0)} · CVR ${pct(safeRate(r.transactions, r.sessions))}`);

      function safeRate(numer, denom) {
        const d = Number(denom) || 0;
        if (d <= 0) return 0;
        return (Number(numer) / d) * 100;
      }

      summary = [
        `**Campaign detail: ${campaign || "(not set)"}** ${rng}${filtText}`,
        "",
        `**Totals**  Sessions: ${num(t.sessions)} · Users: ${num(t.users)} · Transactions: ${num(t.transactions)} · Revenue: ${money(t.revenue)} · CVR ${pct(cvr)} · AOV ${money(aov)}`,
        "",
        `**Top Source/Medium**`,
        topSM.length ? topSM.join("\n") : "   No source/medium rows.",
        "",
        `**Top Ad Content**`,
        topContent.length ? topContent.join("\n") : "   No ad content rows.",
        "",
        `**Top Terms**`,
        topTerm.length ? topTerm.join("\n") : "   No term rows.",
        "",
        `**Actions**`,
        `• Scale the best Source/Medium pairs; replicate creative from top content variants.`,
        `• For terms with spend but weak revenue, tighten match types or exclude low-intent queries.`,
      ].join("\n");
    }

    /* =========================================================================
       Landing Pages × Attribution
       ====================================================================== */
    else if (topic === "landing-pages") {
      // rows: [{ landing, source, medium, sessions, users, transactions, revenue }]
      const list = rows || [];
      const totalSess = list.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
      const totalRev = list.reduce((a, r) => a + (Number(r.revenue) || 0), 0);

      const highSessLowTrans = [...list]
        .filter((r) => Number(r.sessions || 0) >= 100 && Number(r.transactions || 0) / Math.max(1, Number(r.sessions)) < 0.01)
        .sort((a, b) => (Number(b.sessions) || 0) - (Number(a.sessions) || 0))
        .slice(0, 5)
        .map(
          (r, i) =>
            `   ${i + 1}. ${r.landing} — ${num(r.sessions)} sessions, ${num(r.transactions)} purchases, Rev ${money(r.revenue || 0)} (src/med: ${r.source} / ${r.medium})`
        );

      summary = [
        `**Landing Pages × Attribution** ${rng}${filtText}`,
        "",
        `**Totals**  Sessions: ${num(totalSess)} · Revenue: ${money(totalRev)}`,
        "",
        `**High traffic, low purchases (opportunity)**`,
        highSessLowTrans.length ? highSessLowTrans.join("\n") : "   None detected with current threshold.",
        "",
        `**Actions**`,
        `• Align LP headline & CTA to traffic source intent.`,
        `• Add internal links from top informational pages to high-intent PDP/PLP.`,
        `• Run an A/B on hero (copy + social proof) for the top underperforming LP.`,
      ].join("\n");
    }

    /* =========================================================================
       Products
       ====================================================================== */
    else if (topic === "products") {
      // rows: [{ name, id, views, carts, purchases, revenue }]
      const list = rows || [];
      const totalRev = list.reduce((a, r) => a + (Number(r.revenue) || 0), 0);

      const highViewsLowCarts = [...list]
        .filter((r) => Number(r.views || 0) >= 100 && Number(r.carts || 0) / Math.max(1, Number(r.views)) < 0.05)
        .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
        .slice(0, 5)
        .map(
          (r, i) =>
            `   ${i + 1}. ${r.name || r.id || "(item)"} — ${num(r.views)} views · ${num(r.carts)} carts · ${num(r.purchases)} purchases · Rev ${money(r.revenue || 0)}`
        );

      const revenueLeaders = [...list]
        .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
        .slice(0, 5)
        .map((r, i) => `   ${i + 1}. ${r.name || r.id || "(item)"} — ${money(r.revenue || 0)}`);

      summary = [
        `**Product Performance** ${rng}${filtText}`,
        "",
        `**Total item revenue** ${money(totalRev)}`,
        "",
        `**Top revenue SKUs**`,
        revenueLeaders.length ? revenueLeaders.join("\n") : "   No items.",
        "",
        `**High views, low add-to-cart (UX gaps)**`,
        highViewsLowCarts.length ? highViewsLowCarts.join("\n") : "   None detected with current thresholds.",
        "",
        `**Actions**`,
        `• Improve PDP: above-the-fold clarity, images, shipping/returns, and trust badges.`,
        `• Add cross-sell bundles and price anchoring; test urgency or availability cues where appropriate.`,
      ].join("\n");
    }

    /* =========================================================================
       Checkout Funnel (kept from your original)
       ====================================================================== */
    else if (topic === "checkout_funnel") {
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

    /* =========================================================================
       Channels (Default Channel Group)
       ====================================================================== */
    else if (topic === "channels") {
      // rows: [{ channel, sessions, users }]
      const totalSessions = rows.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
      const totalUsers = rows.reduce((a, r) => a + (Number(r.users) || 0), 0);
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
      ]
        .filter(Boolean)
        .join("\n");
    }

    /* =========================================================================
       Source / Medium
       ====================================================================== */
    else if (topic === "source_medium") {
      // rows: [{ source, medium, sessions, users }]
      const totalSessions = rows.reduce((a, r) => a + (Number(r.sessions) || 0), 0);
      const sorted = [...rows].sort((a, b) => (Number(b.sessions) || 0) - (Number(a.sessions) || 0));
      const top5 = sorted.slice(0, 5);
      const lines =
        top5.length > 0
          ? top5
              .map((r, i) => {
                const share = safeShare(r.sessions || 0, totalSessions, 1);
                return `   ${i + 1}. ${r.source} / ${r.medium} — ${num(r.sessions)} sessions (${share}%)`;
              })
              .join("\n")
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

    /* =========================================================================
       Pages
       ====================================================================== */
    else if (topic === "pages") {
      // rows: [{ title, path, views, users }]
      const totalViews = rows.reduce((a, r) => a + (Number(r.views) || 0), 0);
      const top5 = [...rows].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 5);
      const lines =
        top5.length > 0
          ? top5
              .map((r, i) => {
                const share = safeShare(r.views || 0, totalViews, 1);
                return `   ${i + 1}. ${r.title || r.path} — ${num(r.views)} views (${share}%)`;
              })
              .join("\n")
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

    /* =========================================================================
       E-commerce KPIs
       ====================================================================== */
    else if (topic === "ecom_kpis") {
      // totals: { sessions, users, addToCarts, beginCheckout, transactions, revenue, cvr, aov }
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

    /* =========================================================================
       Fallback
       ====================================================================== */
    else {
      summary = `Summary for ${topicLabel} ${rng}${filtText}`;
    }

    return res.status(200).json({ summary: clamp(summary, 12000) });
  } catch (err) {
    // Keep server logs but avoid leaking details to clients
    console.error("summarise-pro error", err);
    return res.status(500).json({ error: "Server error in summarise-pro" });
  }
}
