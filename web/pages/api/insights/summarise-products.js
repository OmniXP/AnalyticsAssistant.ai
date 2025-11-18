import { withUsageGuard } from "../../../server/usage-limits.js";

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { rows, dateRange } = req.body || {};
    if (!Array.isArray(rows) || !rows.length || !dateRange?.start || !dateRange?.end) {
      return res.status(400).json({ error: "Missing rows/dateRange" });
    }

    const table = rows.slice(0, 30).map((r, i) =>
      `${i + 1}. name="${r.name}" id="${r.id}" views=${r.views} addToCarts=${r.addToCarts} cartToViewRate=${r.cartToViewRate}% purchased=${r.purchased} revenue=${r.revenue}`
    ).join("\n");

    const prompt = `You're an ecommerce analyst. Summarise product performance for ${dateRange.start} to ${dateRange.end}.
Highlight:
- Top revenue-driving items
- High views but poor add-to-cart or purchase (opportunities)
- Quick actions (pricing, bundle, PDP improvements), 3–5 bullets.

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

export default withUsageGuard("ai", handler);
