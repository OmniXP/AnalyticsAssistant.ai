// web/pages/api/chatgpt/oauth/user.js
// ChatGPT OAuth 2.0 userinfo endpoint.

import {
  getChatGPTTokenFromRequest,
  validateChatGPTToken,
  getOrCreateChatGPTUser,
  getChatGPTUserFromRequest,
  updateChatGPTTokenWithUserId,
} from "../../../../lib/server/chatgpt-auth.js";

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

    let user = await getChatGPTUserFromRequest(req);

    // If token exists but user record not yet created, we need chatgptUserId from ChatGPT
    // In ChatGPT's OAuth flow, the user ID should come from ChatGPT's system
    // For now, if we don't have chatgptUserId in token, we can't proceed
    if (!user && !tokenData.chatgptUserId) {
      // Token was stored without chatgptUserId - this shouldn't happen in normal flow
      // but we'll return an error asking ChatGPT to provide user identification
      return res.status(401).json({ 
        error: "invalid_token",
        error_description: "Token missing user identification. Please re-authenticate." 
      });
    }

    // If we have chatgptUserId but no user record, create it
    if (!user && tokenData.chatgptUserId) {
      user = await getOrCreateChatGPTUser(tokenData.chatgptUserId, tokenData.email || null);
      
      // Update token with user ID if it wasn't set before
      if (user && (!tokenData.userId || tokenData.userId !== user.id)) {
        try {
          await updateChatGPTTokenWithUserId(token, user.chatgptUserId, user.email, user.id);
        } catch (e) {
          console.error("[chatgpt/oauth/user] Failed to update token with user ID:", e);
          // Continue - token is still valid
        }
      }
    }

    if (!user) {
      return res.status(401).json({ error: "invalid_token" });
    }

    return res.status(200).json({
      sub: user.chatgptUserId || user.id,
      email: user.email || null,
      email_verified: false,
      name: null,
      premium: !!user.premium,
      plan: user.plan || (user.premium ? "premium" : "free"),
      upgradeUrl: PREMIUM_URL,
    });
  } catch (e) {
    console.error("[chatgpt/oauth/user] Error:", e);
    return res.status(500).json({ error: "server_error" });
  }
}
