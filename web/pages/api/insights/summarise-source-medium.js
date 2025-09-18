// /workspaces/insightsgpt/web/pages/api/insights/summarise-source-medium.js
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { rows, dateRange } = await req.json();
    if (!Array.isArray(rows) || !rows.length || !dateRange?.start || !dateRange?.end) {
      return new Response(JSON.stringify({ error: "Missing rows/dateRange" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const prompt = `
You are an analytics assistant. Summarise traffic sources for the period.

Date range: ${dateRange.start} to ${dateRange.end}

Rows (source, medium, sessions, users):
${rows.map((r, i) => `${i + 1}. ${r.source} / ${r.medium} | sessions=${r.sessions} | users=${r.users}`).join("\n")}

Write:
- One-line headline
- 3–5 key insights (best/worst sources, concentration risk, quick wins)
- 2–3 actions (allocation tweaks, content ideas, tracking fixes)
Return plain text only.
`.trim();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You turn GA4 data into concise, actionable insights." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.error?.message || data?.message || "OpenAI error";
      return new Response(JSON.stringify({ error: message }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const summary = data?.choices?.[0]?.message?.content?.trim() || "No summary";
    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
