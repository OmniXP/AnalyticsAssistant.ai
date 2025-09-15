// /workspaces/insightsgpt/web/pages/api/insights/summarise.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");
  const { rows, totals, dateRange } = await req.json?.() || req.body || {};
  try {
    const prompt = `
You are a web analytics analyst. Using the GA4 table below, write:
1) a crisp summary (3–5 sentences) of what changed in the period ${dateRange?.start} to ${dateRange?.end};
2) 3 focused, commercially sensible actions.

Data (by Default Channel Group):
${rows.map(r => `- ${r.channel}: ${r.sessions} sessions, ${r.users} users`).join("\n")}
Totals: sessions ${totals?.sessions}, users ${totals?.users}.
Keep it plain-English, UK style, no fluff, no bullet emojis.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const json = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(json);
    const text = json.choices?.[0]?.message?.content || "No response";
    res.status(200).json({ summary: text });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
