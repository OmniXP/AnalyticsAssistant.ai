// web/pages/api/chatgpt/v1/insight.js
// Auto-fetching insight endpoint that provides instant GA4 summaries with caching.
// ChatGPT can call this to get immediate insights without user confirmation.

import { getChatGPTConnectionIdFromRequest, getChatGPTUserFromRequest } from "../../../../lib/server/chatgpt-auth.js";
import { isGA4Connected, fetchDefaultGA4Report } from "../../../../lib/server/chatgpt-ga4-helpers.js";
import { SYSTEM_PROMPT } from "../../../../lib/server/chatgpt-config.js";
import { withChatGPTUsageGuard } from "../../../../lib/server/chatgpt-usage.js";
import { kvGetJson } from "../../../../lib/server/ga4-session.js";

async function callOpenAI({ system, user, data }) {
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
        { role: "assistant", content: JSON.stringify(data) },
      ],
    }),
  });

  const text = await res.text();
  let responseData = null;
  try {
    responseData = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const msg = responseData?.error?.message || text || `HTTP ${res.status}`;
    return { ok: false, text: msg };
  }

  const content = responseData?.choices?.[0]?.message?.content?.trim?.() || "";
  return { ok: true, text: content };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const connectionId = await getChatGPTConnectionIdFromRequest(req);
    if (!connectionId) {
      return res.status(401).json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }

    // Check GA4 connection
    const connected = await isGA4Connected(connectionId);
    if (!connected) {
      return res.status(200).json({
        ok: false,
        message: "You're not connected yet — connect Google Analytics below 👇 to start getting live insights.",
        connectUrl: "/api/chatgpt/oauth/ga4/start",
      });
    }

    // Get property ID (from request or use first available)
    const { propertyId } = req.body || {};
    
    let targetPropertyId = propertyId;
    if (!targetPropertyId) {
      // Try to get from connection metadata or fetch first property
      const connectionData = await kvGetJson(`chatgpt_connection:${connectionId}`);
      // For now, require propertyId - ChatGPT should call /properties first
      return res.status(400).json({
        ok: false,
        error: "propertyId required. Call /api/chatgpt/v1/properties first to get available properties.",
      });
    }

    // Fetch or get cached GA4 data
    const ga4Data = await fetchDefaultGA4Report(connectionId, targetPropertyId);

    // Format data for AI
    const userPrompt = `Analyse this GA4 data and provide insights:

Current period: ${ga4Data.dateRange.current.start} to ${ga4Data.dateRange.current.end}
Previous period: ${ga4Data.dateRange.previous.start} to ${ga4Data.dateRange.previous.end}

Totals:
Current: ${ga4Data.totals.current.sessions} sessions, ${ga4Data.totals.current.users} users, ${ga4Data.totals.current.purchases} purchases, £${ga4Data.totals.current.revenue.toFixed(2)} revenue
Previous: ${ga4Data.totals.previous.sessions} sessions, ${ga4Data.totals.previous.users} users, ${ga4Data.totals.previous.purchases} purchases, £${ga4Data.totals.previous.revenue.toFixed(2)} revenue

Top channels:
${ga4Data.rows.slice(0, 5).map(r => {
  const sessChange = r.previous.sessions > 0 
    ? (((r.current.sessions - r.previous.sessions) / r.previous.sessions) * 100).toFixed(1)
    : "N/A";
  return `- ${r.channel}: ${r.current.sessions} sessions (${sessChange}% vs previous), ${r.current.revenue.toFixed(2)} revenue`;
}).join("\n")}

Provide a concise insight summary following the system prompt guidelines.`;

    // Get AI summary
    const ai = await callOpenAI({ system: SYSTEM_PROMPT, user: userPrompt, data: ga4Data });
    if (!ai.ok) {
      return res.status(500).json({ ok: false, error: "AI error", details: ai.text });
    }

    return res.status(200).json({
      ok: true,
      insight: ai.text,
      data: {
        cached: ga4Data.cached,
        dateRange: ga4Data.dateRange,
        totals: ga4Data.totals,
        topChannels: ga4Data.rows.slice(0, 5),
      },
    });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("not connected") || msg.includes("connect your GA4 account")) {
      return res.status(401).json({
        ok: false,
        error: "Google Analytics not connected. Please connect your GA4 account first.",
        code: "GA4_NOT_CONNECTED",
        connectUrl: "/api/chatgpt/oauth/ga4/start",
      });
    }
    console.error("[chatgpt/v1/insight] Error:", e);
    return res.status(500).json({ ok: false, error: msg });
  }
}

export default withChatGPTUsageGuard("ai", handler);
