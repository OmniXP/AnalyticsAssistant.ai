// /workspaces/insightsgpt/web/pages/api/insights/summarise-funnel.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { totals, dateRange } = req.body || {};
    if (!totals || !dateRange?.start || !dateRange?.end) {
      return res.status(400).json({ error: "Missing totals/dateRange" });
    }

    const prompt = `Summarise an ecommerce funnel for ${dateRange.start} to ${dateRange.end}.
Totals:
- Product Views: ${totals.views}
- Add to Carts: ${totals.atc}
- Checkouts: ${totals.checkout}
- Purchases: ${totals.purchases}
- Revenue: £${totals.revenue}

Computed rates:
- ATC rate (ATC / Views): ${totals.viewToAtcRate}%
- Checkout rate (Checkout / ATC): ${totals.atcToCheckoutRate}%
- Purchase rate (Purchases / Checkout): ${totals.checkoutToPurchaseRate}%
- Overall CVR (Purchases / Views): ${totals.viewToPurchaseRate}%

Give 3–5 concise, practical suggestions to improve the weakest step(s).`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", input: prompt, max_output_tokens: 400, temperature: 0.2 }),
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
