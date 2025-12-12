// web/pages/api/chatgpt/oauth/ga4/callback.js
// GA4 OAuth callback for ChatGPT users.

import { readAuthState, exchangeCodeForTokens, inferOrigin } from "../../../../../lib/server/google-oauth.js";
import { saveGA4TokensForChatGPTUser, getOrCreateChatGPTUser } from "../../../../../lib/server/chatgpt-auth.js";

export default async function handler(req, res) {
  try {
    const { code, state, error, chatgpt_user_id } = req.query || {};

    if (error) {
      return res.status(400).send(`OAuth error: ${error}`);
    }

    if (!code || !state) {
      return res.status(400).send("Missing code or state parameter.");
    }

    if (!chatgpt_user_id) {
      return res.status(400).send("Missing ChatGPT user ID.");
    }

    const authState = await readAuthState(state, true);
    if (!authState) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }

    const { code_verifier } = authState;

    const origin = inferOrigin(req);
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
    const tokens = await exchangeCodeForTokens(String(code), code_verifier, redirectUri);

    await saveGA4TokensForChatGPTUser(chatgpt_user_id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });

    // Try to capture email and ensure user linkage
    try {
      const uiResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const ui = await uiResp.json();
      await getOrCreateChatGPTUser(chatgpt_user_id, ui?.email || null);
    } catch (e) {
      console.error("[chatgpt/ga4/callback] Failed to update user email:", e?.message || e);
      await getOrCreateChatGPTUser(chatgpt_user_id, null);
    }

    res.send(`
      <html>
        <head><title>Google Analytics Connected</title></head>
        <body style="font-family: system-ui; max-width: 640px; margin: 40px auto; padding: 20px;">
          <h1>✅ Google Analytics Connected</h1>
          <p>Your Google Analytics account has been connected for ChatGPT.</p>
          <p>You can return to ChatGPT and start asking for insights.</p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">You may close this window.</p>
        </body>
      </html>
    `);
  } catch (e) {
    console.error("[chatgpt/ga4/callback] Error:", e);
    res.status(500).send(`
      <html>
        <head><title>Connection Error</title></head>
        <body style="font-family: system-ui; max-width: 640px; margin: 40px auto; padding: 20px;">
          <h1>❌ Connection Failed</h1>
          <p>An error occurred while connecting Google Analytics: ${String(e?.message || e)}</p>
          <p>Please return to ChatGPT and try again.</p>
        </body>
      </html>
    `);
  }
}
