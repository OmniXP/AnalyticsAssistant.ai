import { withUsageGuard } from "../../../server/usage-limits.js";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { rows, dateRange } = req.body || {};
    if (!Array.isArray(rows) || !rows.length || !dateRange?.start || !dateRange?.end) {
      return res.status(400).json({ error: "Missing rows/dateRange" });
    }

    // Build a compact table-like text for the model
    const table = rows
      .slice(0, 20)
      .map(
        (r, i) =>
          `${i + 1}. title="${r.title}" path="${r.path}" views=${r.views} sessions=${r.sessions} users=${r.users} conv=${r.conversions}`
      )
      .join("\n");

    const prompt = `You're a web analytics assistant. Summarise key landing page insights for ${dateRange.start} to ${dateRange.end}.
Focus on:
- Which landing pages drive the most views & sessions
- Any pages with strong/weak conversions
- Quick actions to try (max 4 bullets)
Keep it concise, non-technical, and useful.

Data:
${table}`;

    // Use OpenAI Responses API (compatible with your existing insight routes pattern)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        max_output_tokens: 400,
        temperature: 0.2,
      }),
    });

    const raw = await openaiRes.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      // fall back to raw text if needed
    }

    if (!openaiRes.ok) {
      const msg = data?.error?.message || data?.error || raw || `HTTP ${openaiRes.status}`;
      return res.status(openaiRes.status).json({ error: msg });
    }

    // Responses API returns { output: [{ content:[{text:"..."}] }], ... } (or similar)
    let text = "";
    try {
      const out = data?.output?.[0]?.content?.[0]?.text;
      text = out || data?.output_text || "";
    } catch {}
    if (!text) text = typeof data === "string" ? data : raw || "No response";

    return res.status(200).json({ summary: text });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

export default withUsageGuard("ai", handler);
