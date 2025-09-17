// /workspaces/insightsgpt/web/pages/api/insights/summarise-top-pages.js
// Summarises GA4 Top Pages with OpenAI and returns { summary: "…" }.
// Requires OPENAI_API_KEY in your environment (Vercel → Settings → Environment Variables).

export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { pages, dateRange } = req.body || {};
  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: "Missing or empty 'pages' array" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  // Keep payload small: take top 20 rows max
  const top = pages.slice(0, 20).map(p => ({
    title: p.title || "(untitled)",
    path: p.path || "",
    views: Number(p.views || 0),
    users: Number(p.users || 0),
  }));

  const prompt = `
You are a web analytics assistant. Write a concise, plain-English insight summary of the website's top pages for the period ${dateRange?.start || "?"} to ${dateRange?.end || "?"}.
Focus on patterns, winners/underperformers, and simple, actionable recommendations.
Avoid waffle. Use 3–6 bullet points max.

Data (pageTitle, path, views, users), sorted by views desc:
${top.map((r, i) => `${i + 1}. ${r.title} | ${r.path} | views=${r.views} | users=${r.users}`).join("\n")}

Return just the summary text. Do not include code fences.
  `.trim();

  try {
    // Minimal call with fetch to OpenAI completions API (responses API)
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
      }),
    });

    const raw = await resp.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : null; } catch {}

    if (!resp.ok) {
      return res.status(resp.status).json(json || { error: "OpenAI error", raw });
    }

    // Extract text safely
    let text = "";
    if (json?.output_text) {
      text = json.output_text;
    } else if (Array.isArray(json?.output) && json.output[0]?.content?.[0]?.text) {
      text = json.output[0].content[0].text;
    } else if (json?.choices?.[0]?.message?.content) {
      text = json.choices[0].message.content; // fallback for other models
    } else {
      text = typeof raw === "string" ? raw : "No response";
    }

    return res.status(200).json({ summary: text.trim() });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
