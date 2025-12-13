// web/pages/api/chatgpt/v1/status.js
// Connection and plan status for ChatGPT users.

import { getChatGPTUserFromRequest, getChatGPTConnectionIdFromRequest, getGA4TokensForConnection, isGA4TokenExpired } from "../../../../lib/server/chatgpt-auth.js";

const PREMIUM_URL = process.env.PREMIUM_URL || process.env.NEXT_PUBLIC_PREMIUM_URL || "https://analyticsassistant.ai/premium";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const connectionId = await getChatGPTConnectionIdFromRequest(req);
    if (!connectionId) {
      return res.status(401).json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }

    // Try to get user for premium checks (optional)
    const user = await getChatGPTUserFromRequest(req);

    const tokens = await getGA4TokensForConnection(connectionId);
    const ga4Connected = !!tokens && !isGA4TokenExpired(tokens);

    return res.status(200).json({
      ok: true,
      user: {
        email: user.email || null,
        premium: !!user.premium,
        plan: user.plan || (user.premium ? "premium" : "free"),
      },
      ga4: {
        connected: ga4Connected,
        expired: tokens ? isGA4TokenExpired(tokens) : true,
      },
      upgradeUrl: PREMIUM_URL,
      canUpgrade: !user.premium,
    });
  } catch (e) {
    console.error("[chatgpt/v1/status] Error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
