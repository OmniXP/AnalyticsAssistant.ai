// web/pages/api/insights/summarise-source-medium.js
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

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { rows, dateRange, filters } = req.body || {};
  if (!rows || !dateRange) {
    return res.status(400).json({ error: "Missing rows/dateRange" });
  }

  const filtersStr = [
    filters?.country && filters.country !== "All" ? `Country: ${filters.country}` : null,
    filters?.channelGroup && filters.channelGroup !== "All" ? `Channel Group: ${filters.channelGroup}` : null,
  ].filter(Boolean).join(" | ") || "None";

  const safeRows = (rows || []).slice(0, 50).map(r => ({
    source: r.source || "(unknown)",
    medium: r.medium || "(unknown)",
    sessions: Number(r.sessions || 0),
    users: Number(r.users || 0),
  }));

  const totalSessions = safeRows.reduce((a, r) => a + r.sessions, 0);
  const totalUsers = safeRows.reduce((a, r) => a + r.users, 0);

  const system = `
You are an acquisition analyst. Create a crisp, actionable summary of source/medium performance.
- Use ONLY provided data.
- Short bullets, numeric where possible.
- Always include >=2 hypotheses & A/B test ideas (e.g., UTM landing pages, creatives, audiences), with success metrics.
- If tracking looks incomplete, call it out and suggest validation.
- ~220 words max.
`;

  const user = `
Date range: ${dateRange.start} → ${dateRange.end}
Filters: ${filtersStr}

Totals (from table scope):
- Sessions: ${totalSessions}
- Users: ${totalUsers}

Top source/medium rows:
${safeRows.map(r => `- ${r.source} / ${r.medium}: ${r.sessions} sessions, ${r.users} users`).join("\n")}

Write:
1) **Snapshot** — key acquisition mix, dominant sources.
2) **What stands out** — up to 3 bullets (e.g., branded vs non-branded, referral spikes).
3) **Fix/Improve** — 3 actions (UTM consistency, landing page mapping, budget shifts).
4) **Hypotheses & A/B tests** — at least two concrete tests (e.g., copy/creative variants, keyword themes, placements) with metrics to watch.
5) **Next steps** — quick checklist (naming, auto-tagging, source deduping).
`;

  const ai = await callOpenAI({ system, user });
  if (!ai.ok) return res.status(500).json({ error: "AI error (source/medium)", details: ai.text });
  return res.status(200).json({ summary: ai.text });
}
