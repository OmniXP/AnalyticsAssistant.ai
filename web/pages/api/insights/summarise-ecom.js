// /workspaces/insightsgpt/web/pages/api/insights/summarise-ecom.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { totals = {}, dateRange = {}, filters = {} } = req.body || {};
  try {
    const sessions = totals.sessions || 0;
    const transactions = totals.transactions || 0;
    const revenue = totals.revenue || 0;
    const cvr = totals.cvr || (sessions > 0 ? (transactions / sessions) * 100 : 0);
    const aov = totals.aov || (transactions > 0 ? revenue / transactions : 0);

    const currencyFmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

    const summary = [
      `E-commerce KPIs ${dateRange.start || ""} → ${dateRange.end || ""}${filters?.country && filters.country !== "All" ? ` · Country: ${filters.country}` : ""}${filters?.channelGroup && filters.channelGroup !== "All" ? ` · Channel: ${filters.channelGroup}` : ""}.`,
      `Revenue: ${currencyFmt.format(revenue)} · Transactions: ${transactions.toLocaleString?.() || transactions} · AOV: ${currencyFmt.format(aov)} · CVR: ${cvr.toFixed(2)}%.`,
    ].join(" ");

    const pro = isPro(req);
    const resp = { summary };

    if (pro) {
      const tests = [];
      if (aov < 40 && revenue > 0) {
        tests.push({
          title: "Bundle/threshold test",
          hypothesis: "Introducing bundles or free shipping threshold lifts AOV without hurting CVR.",
          success_metric: "Average order value",
          impact: "medium",
        });
      }
      if (totals.beginCheckout > totals.transactions * 2) {
        tests.push({
          title: "Checkout reassurance & trust badges",
          hypothesis: "Increasing reassurance reduces checkout abandonment and raises purchase rate.",
          success_metric: "Purchase / Begin Checkout",
          impact: "high",
        });
      }
      if (!tests.length) {
        tests.push({
          title: "Promo strip test",
          hypothesis: "Clear, persistent promo increases both AOV and purchase rate.",
          success_metric: "Revenue per session",
          impact: "low",
        });
      }
      resp.tests = tests;
    } else {
      resp.upgradeHint = "Upgrade to PRO to unlock test ideas to improve CVR and AOV based on your KPIs.";
    }

    return jsonOk(res, resp);
  } catch (e) {
    return res.status(500).json({ error: "summarise-ecom error", details: String(e?.message || e) });
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
