// web/pages/api/chatgpt/oauth/user.js
// ChatGPT OAuth 2.0 userinfo endpoint.

import {
  getChatGPTTokenFromRequest,
  validateChatGPTToken,
  getOrCreateChatGPTUser,
  getChatGPTUserFromRequest,
} from "../../../../lib/server/chatgpt-auth.js";

const PREMIUM_URL = process.env.PREMIUM_URL || process.env.NEXT_PUBLIC_PREMIUM_URL || "https://analyticsassistant.ai/premium";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    let user = await getChatGPTUserFromRequest(req);

    // If the token is valid but user record not yet created, create it using token payload.
    if (!user) {
      const token = getChatGPTTokenFromRequest(req);
      const tokenData = await validateChatGPTToken(token);
      if (tokenData?.chatgptUserId) {
        user = await getOrCreateChatGPTUser(tokenData.chatgptUserId, tokenData.email || null);
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
