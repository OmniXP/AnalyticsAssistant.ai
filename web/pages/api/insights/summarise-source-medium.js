export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow","POST"); return res.status(405).json({ error:"Method Not Allowed" }); }
  const { rows, dateRange } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error:"Missing or empty 'rows'" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error:"OPENAI_API_KEY is not set" });

  const top = rows.slice(0, 20).map((r,i)=>`${i+1}. ${r.source} / ${r.medium} | sessions=${r.sessions} | users=${r.users}`).join("\n");
  const prompt = `
You are a web analytics assistant. Summarise source/medium performance for ${dateRange?.start || "?"} to ${dateRange?.end || "?"}.
Give 3–6 concise bullet points with insights and clear actions (budget shift, creative/landing tweaks, remarketing opportunities).
Data (sorted by sessions):
${top}
Return just the summary text.
  `.trim();

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type":"application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", input: prompt })
    });
    const raw = await resp.text(); let json=null; try{ json = raw ? JSON.parse(raw) : null; }catch{}
    if (!resp.ok) return res.status(resp.status).json(json || { error:"OpenAI error", raw });

    let text = json?.output_text
      || (Array.isArray(json?.output) && json.output[0]?.content?.[0]?.text)
      || json?.choices?.[0]?.message?.content
      || raw || "No response";

    res.status(200).json({ summary: String(text || "").trim() });
  } catch(e) {
    res.status(500).json({ error: String(e) });
  }
}
