// web/pages/api/chatgpt/oauth/ga4/start.js
// Initiate GA4 OAuth flow for ChatGPT users.

import { buildGoogleAuthUrl } from "../../../../lib/server/google-oauth.js";
import { getChatGPTUserFromRequest } from "../../../../lib/server/chatgpt-auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const user = await getChatGPTUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }

    const redirectPath = `/api/chatgpt/oauth/ga4/callback?chatgpt_user_id=${encodeURIComponent(
      user.chatgptUserId || user.id
    )}`;

    const { url } = await buildGoogleAuthUrl(req, { desiredRedirect: redirectPath });

    return res.status(200).json({
      ok: true,
      auth_url: url,
      message: "Open this URL to connect Google Analytics. Return to ChatGPT after completing the flow.",
    });
  } catch (e) {
    console.error("[chatgpt/ga4/start] Error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
