// web/pages/api/insights/summarise.js
import { getIronSession } from "iron-session";

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

async function callOpenAI({ system, user }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, text: "Missing OPENAI_API_KEY" };

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
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = data?.error?.message || text || `HTTP ${res.status}`;
    return { ok: false, text: msg };
  }

  const content = data?.choices?.[0]?.message?.content?.trim?.() || "";
  return { ok: true, text: content };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  // Require a connected session (consistent with rest of app)
  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { rows, totals, dateRange, filters } = req.body || {};
  if (!rows || !totals || !dateRange) {
    return res.status(400).json({ error: "Missing rows/totals/dateRange" });
  }

  const filtersStr = [
    filters?.country && filters.country !== "All" ? `Country: ${filters.country}` : null,
    filters?.channelGroup && filters.channelGroup !== "All" ? `Channel Group: ${filters.channelGroup}` : null,
  ].filter(Boolean).join(" | ") || "None";

  // Keep payload compact and numeric
  const safeRows = (rows || []).map(r => ({
    channel: r.channel || "(unknown)",
    sessions: Number(r.sessions || 0),
    users: Number(r.users || 0),
  }));
  const { sessions = 0, users = 0 } = totals || {};

  const system = `
You are an expert growth analyst. Produce a concise, high-signal readout for a founder/marketing lead.
Rules:
- Use ONLY provided numbers; do not invent metrics.
- Be specific & numeric. Short, scannable bullets.
- Always include >=2 hypotheses & A/B test ideas with metrics to watch.
- If data is sparse, say so and recommend validation steps.
- Keep it under ~220 words.
`;

  const user = `
Date range: ${dateRange.start} → ${dateRange.end}
Filters: ${filtersStr}

Totals:
- Sessions: ${sessions}
- Users: ${users}

Channel rows (top to bottom):
${safeRows.map(r => `- ${r.channel}: ${r.sessions} sessions, ${r.users} users`).join("\n")}

Write:
1) **Snapshot** — level/quality of traffic (top channels, share).
2) **What stands out** — up to 3 bullets (e.g., dependency on 1–2 channels, missing brand search, etc.).
3) **Fix/Improve** — 3 actions prioritised (e.g., strengthen underperforming channels, attribution issues).
4) **Hypotheses & A/B tests** — at least two concrete ideas with success metrics (sessions, engaged sessions, CVR).
5) **Next steps** — a short checklist (measurement, budget shifts, channel tests).
`;

  const ai = await callOpenAI({ system, user });
  if (!ai.ok) return res.status(500).json({ error: "AI error (channels)", details: ai.text });
  return res.status(200).json({ summary: ai.text });
}
