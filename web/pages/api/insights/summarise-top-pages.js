import { withUsageGuard } from "../../../server/usage-limits.js";

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { rows, dateRange } = req.body || {};
    if (!Array.isArray(rows) || !rows.length || !dateRange?.start || !dateRange?.end) {
      return res.status(400).json({ error: "Missing rows/dateRange" });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const prompt = `
You are an analytics assistant. Summarise website performance for the given date range in clear, non-technical language with 3–5 bullets and 2–3 actions.

Date range: ${dateRange.start} to ${dateRange.end}

Top pages (title, path, views, users):
${rows.map((r, i) => `${i + 1}. ${r.title} | ${r.path} | views=${r.views} | users=${r.users}`).join("\n")}

Write:
- One-line headline
- 3–5 key insights (mix of traffic, engagement, obvious anomalies)
- 2–3 actions (specific, pragmatic)
Return plain text only.
`.trim();

    const model = "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You turn GA4 data into concise, actionable insights." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error?.message || data?.message || "OpenAI error";
      return res.status(response.status).json({ error: message });
    }

    // Track usage and costs
    try {
      const { trackOpenAIUsage } = await import("../../../lib/server/ai-tracking.js");
      await trackOpenAIUsage(model, data?.usage);
    } catch (e) {
      console.error("[summarise-top-pages] Failed to track AI usage:", e.message);
    }

    const summary = data?.choices?.[0]?.message?.content?.trim() || "No summary";
    return res.status(200).json({ summary });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

export default withUsageGuard("ai", handler);

