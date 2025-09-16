// /workspaces/insightsgpt/web/pages/api/insights/summarise.js
function makeFallbackSummary(rows = [], totals = { sessions: 0, users: 0 }, dateRange = {}) {
  const totalSessions = totals.sessions || rows.reduce((a, r) => a + (r.sessions || 0), 0);
  const totalUsers = totals.users || rows.reduce((a, r) => a + (r.users || 0), 0);
  const sorted = [...rows].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
  const top = sorted[0];
  const pct = top && totalSessions ? Math.round((top.sessions / totalSessions) * 100) : 0;

  const lines = [
    `Period: ${dateRange.start || "start"} → ${dateRange.end || "end"}.`,
    `Total sessions: ${totalSessions}. Total users: ${totalUsers}.`,
  ];
  if (top) lines.push(`Top channel: ${top.channel} with ${top.sessions} sessions (${pct}% share).`);
  const actions = [
    `Ensure all campaigns use UTM tags to reduce “Direct”.`,
    `Improve SEO basics (titles, meta, internal links, sitemap) to grow Organic Search.`,
    `Standardise social and partner links with UTMs; review referral sources.`,
  ];
  return `${lines.join(" ")}\n\nActions:\n- ${actions.join("\n- ")}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { rows = [], totals = { sessions: 0, users: 0 }, dateRange = {} } = req.body || {};

  // If there is no OpenAI key, return a clear fallback summary (still JSON)
  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({
      summary: makeFallbackSummary(rows, totals, dateRange),
      source: "fallback",
      reason: "Missing OPENAI_API_KEY",
    });
  }

  const prompt = `
You are a web analytics analyst. Using the GA4 table below, write:
1) a crisp summary (3–5 sentences) of what changed in the period ${dateRange?.start} to ${dateRange?.end};
2) 3 focused, commercially sensible actions.

Data (by Default Channel Group):
${rows.map(r => `- ${r.channel}: ${r.sessions} sessions, ${r.users} users`).join("\n")}
Totals: sessions ${totals.sessions}, users ${totals.users}.
Keep it plain-English, UK style, no fluff, no bullet emojis.`.trim();

  try {
    const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    // Read as text first so we never crash on empty/HTML responses
    const raw = await oaRes.text();

    // If OpenAI is down or empty response, return a fallback summary (still JSON)
    if (!raw) {
      return res.status(200).json({
        summary: makeFallbackSummary(rows, totals, dateRange),
        source: "fallback",
        reason: "OpenAI returned empty body",
      });
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return res.status(200).json({
        summary: makeFallbackSummary(rows, totals, dateRange),
        source: "fallback",
        reason: "OpenAI response was not JSON",
        upstream: raw.slice(0, 500),
      });
    }

    if (!oaRes.ok) {
      return res.status(200).json({
        summary: makeFallbackSummary(rows, totals, dateRange),
        source: "fallback",
        reason: `OpenAI error ${oaRes.status}`,
        upstream: json,
      });
    }

    const summary = json?.choices?.[0]?.message?.content || makeFallbackSummary(rows, totals, dateRange);
    return res.status(200).json({ summary, source: "openai" });
  } catch (e) {
    return res.status(200).json({
      summary: makeFallbackSummary(rows, totals, dateRange),
      source: "fallback",
      reason: String(e),
    });
  }
}
