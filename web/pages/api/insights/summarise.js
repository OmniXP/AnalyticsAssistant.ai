// /workspaces/insightsgpt/web/pages/api/insights/summarise.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { rows = [], totals = {}, dateRange = {}, filters = {} } = req.body || {};
  try {
    const sumSessions = totals.sessions || 0;
    const sumUsers = totals.users || 0;
    const top = rows[0];

    const summary = [
      `Traffic overview ${dateRange.start || ""} → ${dateRange.end || ""}${filters?.country && filters.country !== "All" ? ` · Country: ${filters.country}` : ""}${filters?.channelGroup && filters.channelGroup !== "All" ? ` · Channel: ${filters.channelGroup}` : ""}.`,
      `Sessions: ${sumSessions.toLocaleString?.() || sumSessions}, Users: ${sumUsers.toLocaleString?.() || sumUsers}.`,
      top ? `Top channel: ${top.channel} (${top.sessions.toLocaleString?.() || top.sessions} sessions).` : "No channel rows returned.",
    ].join(" ");

    const pro = isPro(req);
    const resp = { summary };

    if (pro) {
      // Heuristic tests/hypotheses for PRO
      const tests = [];

      if (top && top.channel === "Direct" && sumSessions > 100) {
        tests.push({
          title: "Homepage hero A/B",
          hypothesis: "Clarifying value prop will increase clicks to PDP for Direct users unfamiliar with the brand.",
          success_metric: "Homepage → PDP click-through rate",
          impact: "high",
        });
      }
      const organicSearch = rows.find(r => r.channel === "Organic Search");
      if (organicSearch && organicSearch.sessions > 0) {
        tests.push({
          title: "SEO snippet test on top landing page",
          hypothesis: "Improving title/meta will lift Organic Search CTR and sessions.",
          success_metric: "Organic Search sessions to top landing page",
          impact: "medium",
        });
      }
      if (!tests.length) {
        tests.push({
          title: "Navigation clarity test",
          hypothesis: "Improving top-nav signposting increases depth of session across channels.",
          success_metric: "Pages per session",
          impact: "medium",
        });
      }
      resp.tests = tests;
    } else {
      resp.upgradeHint = "Upgrade to PRO to see recommended tests & hypotheses tailored to your data.";
    }

    return jsonOk(res, resp);
  } catch (e) {
    return res.status(500).json({ error: "summarise error", details: String(e?.message || e) });
  }
}

// local helpers
function isPro(req) {
  try {
    const c = req.headers.cookie || "";
    return /(?:^|;\s*)isPro=1(?:;|$)/.test(c);
  } catch {
    return false;
  }
}
function jsonOk(res, obj) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).end(JSON.stringify(obj));
}
