// /workspaces/insightsgpt/web/pages/api/insights/summarise-pages.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { rows = [], dateRange = {}, filters = {} } = req.body || {};
  try {
    const top = rows[0];
    const totalViews = rows.reduce((a, r) => a + (r.views || 0), 0);
    const summary = [
      `Top pages ${dateRange.start || ""} → ${dateRange.end || ""}${filters?.country && filters.country !== "All" ? ` · Country: ${filters.country}` : ""}${filters?.channelGroup && filters.channelGroup !== "All" ? ` · Channel: ${filters.channelGroup}` : ""}.`,
      `Total pageviews across listed pages: ${totalViews.toLocaleString?.() || totalViews}.`,
      top ? `Top page: ${top.title || top.path} (${(top.views || 0).toLocaleString?.() || top.views} views).` : "No page rows returned.",
    ].join(" ");

    const pro = isPro(req);
    const resp = { summary };

    if (pro) {
      const tests = [];
      if (top && (top.path || "").toLowerCase().includes("/product")) {
        tests.push({
          title: "PDP above-the-fold CTA test",
          hypothesis: "A clearer, sticky CTA increases add-to-cart from PDP traffic.",
          success_metric: "Add-to-cart rate from PDP",
          impact: "high",
        });
      } else {
        tests.push({
          title: "Internal linking on top blog page",
          hypothesis: "Adding contextual links lifts journey to category/PDP pages.",
          success_metric: "Blog → PDP click-through rate",
          impact: "medium",
        });
      }
      resp.tests = tests;
    } else {
      resp.upgradeHint = "Upgrade to PRO to unlock recommended tests & hypotheses for your top pages.";
    }

    return jsonOk(res, resp);
  } catch (e) {
    return res.status(500).json({ error: "summarise-pages error", details: String(e?.message || e) });
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
