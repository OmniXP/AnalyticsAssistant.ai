// /workspaces/insightsgpt/web/pages/api/insights/summarise.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Next.js parses JSON body for us (because we send Content-Type: application/json)
  const { rows = [], totals = { sessions: 0, users: 0 }, dateRange = {} } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY env var" });
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

    // Read as text first so we can handle non-JSON responses gracefully
    const raw = await oaRes.text();
    let json;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      return res
        .status(oaRes.status || 502)
        .json({ error: "Upstream response was not JSON", upstream: raw?.slice(0, 1000) || "" });
    }

    if (!oaRes.ok) {
      return res.status(oaRes.status).json(json || { error: "OpenAI error", raw });
    }

    const summary = json?.choices?.[0]?.message?.content || "No response";
    return res.status(200).json({ summary });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
