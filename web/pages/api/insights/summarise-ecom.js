// web/pages/api/insights/summarise-ecom.js
import { getIronSession } from "iron-session";

// Same session config you already use elsewhere
const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

// Minimal OpenAI call helper (compatible with Vercel env)
// Uses Responses API-style; adjust if your existing client is different.
async function callOpenAI({ system, user }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, text: "Missing OPENAI_API_KEY" };
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = data?.error?.message || text || `HTTP ${res.status}`;
    return { ok: false, text: msg };
  }

  const content = data?.choices?.[0]?.message?.content?.trim?.() || "";
  return { ok: true, text: content };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");
  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { totals, dateRange, filters } = req.body || {};
  if (!totals || !dateRange) {
    return res.status(400).json({ error: "Missing totals/dateRange" });
  }

  // Build a tight “data card” for the model (use numbers safely)
  const {
    sessions = 0,
    users = 0,
    addToCarts = 0,
    beginCheckout = 0,
    transactions = 0,
    revenue = 0,
    cvr = 0, // purchase / session (%)
    aov = 0, // revenue / transactions
  } = totals || {};

  const filtersStr = [
    filters?.country && filters.country !== "All" ? `Country: ${filters.country}` : null,
    filters?.channelGroup && filters.channelGroup !== "All" ? `Channel Group: ${filters.channelGroup}` : null,
  ].filter(Boolean).join(" | ") || "None";

  const system = `
You are an expert e-commerce performance analyst. 
Your job: produce a crisp, insight-dense summary that a founder or marketing lead can act on immediately.
Constraints:
- Be specific and numeric. Use the provided values; do NOT fabricate data.
- Never say "I think" or "it seems"—be precise.
- If a value is 0 or missing, treat it as such and advise how to validate or fix tracking.
- Use short, scannable bullets with bolded labels where helpful.
- Always include at least TWO hypotheses & tests (clear A/B ideas) tailored to the data.
- Keep it under ~220 words if possible.
`;

  const user = `
Date range: ${dateRange.start} → ${dateRange.end}
Filters: ${filtersStr}

E-commerce totals:
- Sessions: ${sessions}
- Users: ${users}
- Add-to-Carts (events): ${addToCarts}
- Begin Checkout (events): ${beginCheckout}
- Transactions: ${transactions}
- Revenue: ${revenue}
- Conversion Rate (purchase/session): ${cvr}%
- AOV (Revenue/Transactions): ${aov}

Write:
1) **Snapshot** — 2–3 bullets on level and quality of traffic and performance (CVR, AOV).
2) **What stands out** — 3 bullets max (e.g., bottlenecks: low ATC rate, drop-off pre-payment).
3) **Fix/Improve** — 3 targeted actions (prioritised).
4) **Hypotheses & A/B tests** — at least **two** concrete test ideas with metrics to watch (e.g., CVR, AOV).
5) **Next steps** — short checklist (instrumentation or GA validation if needed).

When metrics are 0 or very low, suggest exactly what to verify in GA4 (events, items array, purchase revenue mapping).
Use direct, practical language.
`;

  const ai = await callOpenAI({ system, user });
  if (!ai.ok) {
    return res.status(500).json({ error: "AI error (ecom)", details: ai.text });
  }

  return res.status(200).json({ summary: ai.text });
}
