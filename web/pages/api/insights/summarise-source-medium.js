// /workspaces/insightsgpt/web/pages/api/insights/summarise-source-medium.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { rows = [], dateRange = {}, filters = {} } = req.body || {};
  try {
    const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
    const top = rows[0];
    const summary = [
      `Source/Medium ${dateRange.start || ""} → ${dateRange.end || ""}${filters?.country && filters.country !== "All" ? ` · Country: ${filters.country}` : ""}${filters?.channelGroup && filters.channelGroup !== "All" ? ` · Channel: ${filters.channelGroup}` : ""}.`,
      `Total sessions across listed source/medium pairs: ${totalSessions.toLocaleString?.() || totalSessions}.`,
      top ? `Top pair: ${top.source} / ${top.medium} (${(top.sessions || 0).toLocaleString?.() || top.sessions} sessions).` : "No rows returned.",
    ].join(" ");

    const pro = isPro(req);
    const resp = { summary };

    if (pro) {
      const tests = [];
      const emailRow = rows.find(r => (r.medium || "").toLowerCase() === "email");
      if (emailRow) {
        tests.push({
          title: "Subject line + preheader test",
          hypothesis: "Sharper subject/preheader increases Email sessions and CTR.",
          success_metric: "Email sessions (source/medium)",
          impact: "medium",
        });
      }
      const socialRow = rows.find(r => (r.medium || "").toLowerCase().includes("social"));
      if (socialRow) {
        tests.push({
          title: "Paid social creative variant",
          hypothesis: "Creative variant tailored to top audience boosts sessions/users.",
          success_metric: "Paid Social sessions",
          impact: "medium",
        });
      }
      if (!tests.length) {
        tests.push({
          title: "UTM hygiene audit",
          hypothesis: "Standardising UTMs improves channel attribution and campaign insight quality.",
          success_metric: "Share of (other) / (not set) decreases",
          impact: "low",
        });
      }
      resp.tests = tests;
    } else {
      resp.upgradeHint = "Upgrade to PRO to see campaign-level test ideas for your strongest source/medium pairs.";
    }

    return jsonOk(res, resp);
  } catch (e) {
    return res.status(500).json({ error: "summarise-source-medium error", details: String(e?.message || e) });
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
