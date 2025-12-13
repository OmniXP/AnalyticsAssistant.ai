// web/pages/api/chatgpt/oauth/user.js
// ChatGPT OAuth 2.0 userinfo endpoint.

import {
  getChatGPTTokenFromRequest,
  validateChatGPTToken,
  getChatGPTUserFromRequest,
  getChatGPTConnectionIdFromRequest,
} from "../../../../lib/server/chatgpt-auth.js";
import { kvGetJson } from "../../../../lib/server/ga4-session.js";

const PREMIUM_URL = process.env.PREMIUM_URL || process.env.NEXT_PUBLIC_PREMIUM_URL || "https://analyticsassistant.ai/premium";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = getChatGPTTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const tokenData = await validateChatGPTToken(token);
    if (!tokenData) {
      return res.status(401).json({ error: "invalid_token" });
    }

    // Try to get user (optional - for premium checks)
    let user = await getChatGPTUserFromRequest(req);
    
    // Get connectionId (always available)
    const connectionId = tokenData.connectionId;
    
    // Try to get email from connection mapping (if GA4 was connected)
    let email = null;
    if (connectionId) {
      const connectionData = await kvGetJson(`chatgpt_connection:${connectionId}`);
      email = connectionData?.email || null;
    }
    
    // If we have a user, use their data
    if (user) {
      return res.status(200).json({
        sub: user.chatgptUserId || user.id || connectionId,
        email: user.email || email || null,
        email_verified: false,
        name: null,
        premium: !!user.premium,
        plan: user.plan || (user.premium ? "premium" : "free"),
        upgradeUrl: PREMIUM_URL,
      });
    }
    
    // If no user but we have connectionId, return basic info
    if (connectionId) {
      return res.status(200).json({
        sub: connectionId,
        email: email || null,
        email_verified: false,
        name: null,
        premium: false,
        plan: "free",
        upgradeUrl: PREMIUM_URL,
      });
    }

    // Fallback: return error if we can't identify the connection
    return res.status(401).json({ error: "invalid_token" });
  } catch (e) {
    console.error("[chatgpt/oauth/user] Error:", e);
    return res.status(500).json({ error: "server_error" });
  }
}
