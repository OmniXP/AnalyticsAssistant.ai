// /workspaces/insightsgpt/web/pages/api/insights/summarise-campaigns.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { rows, dateRange } = req.body || {};
    if (!Array.isArray(rows) || !rows.length || !dateRange?.start || !dateRange?.end) {
      return res.status(400).json({ error: "Missing rows/dateRange" });
    }

    const table = rows.slice(0, 30).map((r, i) =>
      `${i + 1}. src="${r.source}" med="${r.medium}" camp="${r.campaign}" ` +
      `sessions=${r.sessions} users=${r.users} views=${r.views} conv=${r.conversions} rev=${r.revenue}`
    ).join("\n");

    const prompt = `You are a marketing analytics assistant. Summarise campaign performance for ${dateRange.start} to ${dateRange.end}.
Focus on:
- Highest revenue and conversions by source/medium/campaign
- Any campaigns with strong volume but weak conversion
- 3–5 practical recommendations

Data:
${table}`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", input: prompt, max_output_tokens: 450, temperature: 0.2 }),
    });

    const raw = await openaiRes.text();
    let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}

    if (!openaiRes.ok) {
      const msg = data?.error?.message || data?.error || raw || `HTTP ${openaiRes.status}`;
      return res.status(openaiRes.status).json({ error: msg });
    }

    let text = "";
    try { text = data?.output?.[0]?.content?.[0]?.text || data?.output_text || ""; } catch {}
    if (!text) text = typeof data === "string" ? data : raw || "No response";

    res.status(200).json({ summary: text });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
