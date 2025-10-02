// /workspaces/insightsgpt/web/pages/api/insights/summarise-funnel.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { steps = {}, dateRange = {}, filters = {} } = req.body || {};
  try {
    const s = {
      add_to_cart: steps.add_to_cart || 0,
      begin_checkout: steps.begin_checkout || 0,
      add_shipping_info: steps.add_shipping_info || 0,
      add_payment_info: steps.add_payment_info || 0,
      purchase: steps.purchase || 0,
    };

    const summary = [
      `Checkout funnel ${dateRange.start || ""} → ${dateRange.end || ""}${filters?.country && filters.country !== "All" ? ` · Country: ${filters.country}` : ""}${filters?.channelGroup && filters.channelGroup !== "All" ? ` · Channel: ${filters.channelGroup}` : ""}.`,
      `Add to cart: ${s.add_to_cart.toLocaleString?.() || s.add_to_cart}; Begin checkout: ${s.begin_checkout.toLocaleString?.() || s.begin_checkout}; Purchase: ${s.purchase.toLocaleString?.() || s.purchase}.`,
    ].join(" ");

    const pro = isPro(req);
    const resp = { summary };

    if (pro) {
      const tests = [];
      if (s.begin_checkout > 0 && s.purchase / s.begin_checkout < 0.5) {
        tests.push({
          title: "Checkout simplification",
          hypothesis: "Reducing form fields and enabling guest checkout increases completion rate.",
          success_metric: "Purchase / Begin Checkout",
          impact: "high",
        });
      }
      if (s.add_to_cart > 0 && s.begin_checkout / s.add_to_cart < 0.6) {
        tests.push({
          title: "Cart page UX",
          hypothesis: "Adding shipping estimate and trust signals raises proceed-to-checkout.",
          success_metric: "Begin Checkout / Add to Cart",
          impact: "medium",
        });
      }
      if (!tests.length) {
        tests.push({
          title: "Payment options test",
          hypothesis: "Offering preferred local payment options increases completion.",
          success_metric: "Purchase / Add Payment Info",
          impact: "medium",
        });
      }
      resp.tests = tests;
    } else {
      resp.upgradeHint = "Upgrade to PRO to reveal test ideas for the biggest funnel drop-offs.";
    }

    return jsonOk(res, resp);
  } catch (e) {
    return res.status(500).json({ error: "summarise-funnel error", details: String(e?.message || e) });
  }
}

function isPro(req) {
  try {
    const c = req.headers.cookie || "";
    return /(?:^|;\s*)isPro=1(?:;|$)/.test(c);
  } catch { return false; }
}
function jsonOk(res, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).end(JSON.stringify(obj));
}
