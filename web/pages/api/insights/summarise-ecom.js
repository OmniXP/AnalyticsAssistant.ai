// web/pages/api/insights/summarise-ecom.js
// Turns totals into a narrative with practical next steps. No GA auth.

function fmtInt(n) { return Number(n || 0).toLocaleString("en-GB"); }
function fmtGBP(n) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n || 0)); }
function toPct(n) { return `${(Number(n || 0)).toFixed(2)}%`; }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { totals = {}, dateRange = {}, filters = {} } = req.body || {};
    const period = dateRange?.start && dateRange?.end ? `${dateRange.start} → ${dateRange.end}` : "the selected period";
    const scope = [
      filters?.country && filters.country !== "All" ? `country = ${filters.country}` : "",
      filters?.channelGroup && filters.channelGroup !== "All" ? `channel = ${filters.channelGroup}` : "",
    ].filter(Boolean).join("; ");
    const scopeLine = scope ? `Filters: ${scope}` : "Filters: none";

    const sessions = Number(totals.sessions || 0);
    const users = Number(totals.users || 0);
    const atc = Number(totals.addToCarts || 0);
    const checkouts = Number(totals.beginCheckout || 0); // fed from 'checkouts' metric upstream
    const tx = Number(totals.transactions || 0);
    const revenue = Number(totals.revenue || 0);
    const cvr = Number(totals.cvr || (sessions > 0 ? (tx / sessions) * 100 : 0));
    const aov = Number(totals.aov || (tx > 0 ? revenue / tx : 0));

    const atcRate = sessions > 0 ? (atc / sessions) * 100 : 0;
    const checkoutRate = atc > 0 ? (checkouts / atc) * 100 : 0;
    const purchaseRate = checkouts > 0 ? (tx / checkouts) * 100 : 0;

    const findings = [
      `E-commerce summary (${period})`,
      scopeLine,
      ``,
      `Headline: ${fmtGBP(revenue)} revenue from ${fmtInt(tx)} purchases.`,
      `Traffic: ${fmtInt(sessions)} sessions, ${fmtInt(users)} users.`,
      `Conversion: site CVR ${toPct(cvr)}; AOV ${fmtGBP(aov)}.`,
      `Funnel ratios: ATC rate ${toPct(atcRate)}, Checkout-from-ATC ${toPct(checkoutRate)}, Purchase-from-Checkout ${toPct(purchaseRate)}.`,
    ];

    const actions = [
      `Actions that matter:`,
      `• Boost AOV: bundle suggestions on PDP/cart; progressive free-shipping threshold; cross-sell in checkout.`,
      `• Raise CVR: clarify value props; reduce form friction; guest checkout default; popular wallets visible early.`,
      `• Price & promo: rationalise promos; ensure stack rules do not confuse; surface net price early.`,
      `• Trust: above-the-fold delivery promise, returns policy, and review count on PDP and checkout.`,
    ];

    const tests = [
      `Recommended tests:`,
      `• Cart value ladder: dynamic free-shipping threshold with progress bar vs. static threshold.`,
      `• Wallets on PDP: Apple/Google Pay exposure on PDP for mobile vs. control; measure CVR and speed-to-purchase.`,
      `• Social proof density: review stars + count near CTA vs. control; measure ATC and checkout start.`,
      `• Checkout form: 1-page vs. multi-step with auto-fill; measure completion and error rate.`,
    ];

    const summary = [
      findings.join("\n"),
      ``,
      actions.join("\n"),
      ``,
      tests.join("\n"),
    ].join("\n");

    res.status(200).json({ summary });
  } catch (e) {
    res.status(200).json({ summary: `Unable to summarise e-commerce: ${String(e?.message || e)}` });
  }
}
