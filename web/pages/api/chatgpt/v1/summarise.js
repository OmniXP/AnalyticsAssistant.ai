// web/pages/api/chatgpt/v1/summarise.js
// AI summary endpoint for ChatGPT users (usage-guarded, premium-aware).

import { getChatGPTUserFromRequest, getGA4TokensForChatGPTUser, isGA4TokenExpired } from "../../../../lib/server/chatgpt-auth.js";
import { withChatGPTUsageGuard } from "../../../../lib/server/chatgpt-usage.js";

async function callOpenAI({ system, user }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, text: "Missing OPENAI_API_KEY" };

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const msg = data?.error?.message || text || `HTTP ${res.status}`;
    return { ok: false, text: msg };
  }

  const content = data?.choices?.[0]?.message?.content?.trim?.() || "";
  return { ok: true, text: content };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const user = await getChatGPTUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }

    const tokens = await getGA4TokensForChatGPTUser(user.chatgptUserId);
    if (!tokens || isGA4TokenExpired(tokens)) {
      return res.status(401).json({
        ok: false,
        error: "Google Analytics not connected. Please connect your GA4 account first.",
        code: "GA4_NOT_CONNECTED",
      });
    }

    const { rows, totals, dateRange, filters } = req.body || {};
    if (!rows || !totals || !dateRange) {
      return res.status(400).json({ ok: false, error: "Missing rows/totals/dateRange" });
    }

    const filtersStr = [
      filters?.country && filters.country !== "All" ? `Country: ${filters.country}` : null,
      filters?.channelGroup && filters.channelGroup !== "All" ? `Channel Group: ${filters.channelGroup}` : null,
    ]
      .filter(Boolean)
      .join(" | ") || "None";

    const safeRows = (rows || []).map(r => ({
      channel: r.channel || "(unknown)",
      sessions: Number(r.sessions || 0),
      users: Number(r.users || 0),
    }));
    const { sessions = 0, users: totalUsers = 0 } = totals || {};

    const system = `
You are an expert growth analyst. Produce a concise, high-signal readout for a founder/marketing lead.
Rules:
- Use ONLY provided numbers; do not invent metrics.
- Be specific & numeric. Short, scannable bullets.
- Always include >=2 hypotheses & A/B test ideas with metrics to watch.
- If data is sparse, say so and recommend validation steps.
- Keep it under ~220 words.
`;

    const userPrompt = `
Date range: ${dateRange.start} → ${dateRange.end}
Filters: ${filtersStr}

Totals:
- Sessions: ${sessions}
- Users: ${totalUsers}

Channel rows (top to bottom):
${safeRows.map(r => `- ${r.channel}: ${r.sessions} sessions, ${r.users} users`).join("\n")}

Write:
1) **Snapshot** — level/quality of traffic (top channels, share).
2) **What stands out** — up to 3 bullets (e.g., dependency on 1–2 channels, missing brand search, etc.).
3) **Fix/Improve** — 3 actions prioritised (e.g., strengthen underperforming channels, attribution issues).
4) **Hypotheses & A/B tests** — at least two concrete ideas with success metrics (sessions, engaged sessions, CVR).
5) **Next steps** — a short checklist (measurement, budget shifts, channel tests).
`;

    const ai = await callOpenAI({ system, user: userPrompt });
    if (!ai.ok) return res.status(500).json({ ok: false, error: "AI error", details: ai.text });

    return res.status(200).json({ ok: true, summary: ai.text });
  } catch (e) {
    console.error("[chatgpt/v1/summarise] Error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

export default withChatGPTUsageGuard("ai", handler);
