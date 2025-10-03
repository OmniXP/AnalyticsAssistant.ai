// /workspaces/insightsgpt/web/pages/api/insights/summarise-funnel.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { steps, dateRange, filters } = req.body || {};
    // Expect shape: { add_to_cart, begin_checkout, add_shipping_info, add_payment_info, purchase }
    const s = steps || {};
    const atc = Number(s.add_to_cart || 0);
    const bc  = Number(s.begin_checkout || 0);
    const ship = Number(s.add_shipping_info || 0);
    const pay  = Number(s.add_payment_info || 0);
    const pur = Number(s.purchase || 0);

    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

    const stepRates = {
      "Begin checkout / Add to cart": pct(bc, atc),
      "Add shipping / Begin checkout": pct(ship, bc),
      "Add payment / Add shipping": pct(pay, ship),
      "Purchase / Add payment": pct(pur, pay),
      "Purchase / Add to cart (overall)": pct(pur, atc),
    };

    // Identify the biggest drop
    const drops = [
      { label: "ATC → Begin checkout", from: atc, to: bc, rate: stepRates["Begin checkout / Add to cart"] },
      { label: "Begin checkout → Add shipping", from: bc, to: ship, rate: stepRates["Add shipping / Begin checkout"] },
      { label: "Add shipping → Add payment", from: ship, to: pay, rate: stepRates["Add payment / Add shipping"] },
      { label: "Add payment → Purchase", from: pay, to: pur, rate: stepRates["Purchase / Add payment"] },
    ];
    drops.sort((a, b) => a.rate - b.rate);
    const worst = drops[0];

    const range = `${dateRange?.start || "?"} → ${dateRange?.end || "?"}`;
    const activeFilters = [];
    if (filters?.country && filters.country !== "All") activeFilters.push(`Country = ${filters.country}`);
    if (filters?.channelGroup && filters.channelGroup !== "All") activeFilters.push(`Channel = ${filters.channelGroup}`);
    const filterLine = activeFilters.length ? `Filters: ${activeFilters.join(" · ")}` : "Filters: none";

    const bullets = [
      `Add to cart: ${atc.toLocaleString()}`,
      `Begin checkout: ${bc.toLocaleString()} (${stepRates["Begin checkout / Add to cart"]}% of ATC)`,
      `Add shipping: ${ship.toLocaleString()} (${stepRates["Add shipping / Begin checkout"]}% of BC)`,
      `Add payment: ${pay.toLocaleString()} (${stepRates["Add payment / Add shipping"]}% of Shipping)`,
      `Purchase: ${pur.toLocaleString()} (${stepRates["Purchase / Add payment"]}% of Payment)`,
      `Overall Purchase / Add to cart: ${stepRates["Purchase / Add to cart (overall)"]}%`,
    ];

    const hypotheses = [
      worst?.label?.includes("ATC → Begin checkout")
        ? "Friction at cart or checkout entry (unclear CTA, surprise costs, slow cart, forced account)."
        : "Cart-to-checkout looks okay; friction may happen deeper in the flow.",
      worst?.label?.includes("Begin checkout → Add shipping")
        ? "Shipping step friction (missing options, pricing shock, address validation issues, long form)."
        : "Shipping seems acceptable; check the next step.",
      worst?.label?.includes("Add shipping → Add payment")
        ? "Payment step friction (limited methods, errors on card, trust badges missing)."
        : "Payment step seems acceptable; check purchase confirmation.",
      worst?.label?.includes("Add payment → Purchase")
        ? "Final confirmation friction (order summary anxiety, extra fees, coupon hunt)."
        : "Final step seems acceptable; validate confirmation UX.",
    ];

    const tests = [
      "Expose total costs earlier (shipping, tax) + clear delivery promise before users commit.",
      "Simplify checkout: fewer fields, auto-fill, guest checkout default, low-friction validation.",
      "Offer popular payment methods (PayPal/Apple/Google Pay, BNPL) and show trust/security badges.",
      "Persistent order summary + mini cart in checkout; remove distractions and coupon field hunts.",
    ];

    const summary =
`Checkout funnel (${range})
${filterLine}

Counts & step-through:
• ${bullets.join("\n• ")}

Biggest bottleneck: ${worst?.label || "n/a"} — step-through rate ${worst?.rate ?? 0}%.

What this suggests:
• ${hypotheses.join("\n• ")}

Recommended tests:
• ${tests.join("\n• ")}

Tip: track checkout_error reasons (custom dim) and segment this funnel by device, country, and channel to isolate UX vs. acquisition issues.`;

    return res.status(200).json({ summary });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to summarise checkout funnel", details: String(err?.message || err) });
  }
}
