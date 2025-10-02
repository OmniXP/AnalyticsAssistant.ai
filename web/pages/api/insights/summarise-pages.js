// web/pages/api/insights/summarise-pages.js
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
    title: r.title || "(untitled)",
    path: r.path || "",
    views: Number(r.views || 0),
    users: Number(r.users || 0),
  }));

  const totalViews = safeRows.reduce((a, r) => a + r.views, 0);
  const totalUsers = safeRows.reduce((a, r) => a + r.users, 0);

  const system = `
You are a CRO/content analyst. Create an actionable summary of top page performance.
- Use ONLY provided values.
- Short, punchy bullets with numbers.
- Always include >=2 hypotheses & A/B tests (e.g., hero copy, CTA, layout, internal linking) with success metrics (CTR, bounce, CVR).
- If titles/paths look generic or missing, recommend content hygiene steps.
- ~220 words max.
`;

  const user = `
Date range: ${dateRange.start} → ${dateRange.end}
Filters: ${filtersStr}

Totals (from table scope):
- Page Views: ${totalViews}
- Users: ${totalUsers}

Top pages:
${safeRows.map(r => `- ${r.title} (${r.path}): ${r.views} views, ${r.users} users`).join("\n")}

Write:
1) **Snapshot** — which content/page types dominate traffic.
2) **What stands out** — up to 3 bullets (e.g., homepage over-reliance, long-tail, blog vs PLP).
3) **Fix/Improve** — 3 actions (above-the-fold, CTA prominence, speed).
4) **Hypotheses & A/B tests** — at least two concrete tests with metrics to watch (CTR to PDP, time on page, scroll depth, CVR).
5) **Next steps** — quick checklist (metadata, internal links, page intent mapping).
`;

  const ai = await callOpenAI({ system, user });
  if (!ai.ok) return res.status(500).json({ error: "AI error (pages)", details: ai.text });
  return res.status(200).json({ summary: ai.text });
}
