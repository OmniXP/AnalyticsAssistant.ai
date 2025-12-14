// web/pages/api/chatgpt/oauth/ga4/callback.js
// GA4 OAuth callback for ChatGPT users using connect_code -> connectionId.

import { readAuthState, exchangeCodeForTokens, inferOrigin } from "../../../../../lib/server/google-oauth.js";
import { saveGA4TokensForConnection } from "../../../../../lib/server/chatgpt-auth.js";
import { kvGetJson, kvSetJson } from "../../../../../lib/server/ga4-session.js";
import { prefetchGA4Summary } from "../../../../../lib/server/chatgpt-ga4-helpers.js";

export default async function handler(req, res) {
  try {
    const { code, state, error, connect_code } = req.query || {};

    if (error) {
      return res.status(400).send(`OAuth error: ${error}`);
    }

    if (!code || !state) {
      return res.status(400).send("Missing code or state parameter.");
    }

    if (!connect_code) {
      return res.status(400).send("Missing connect_code parameter.");
    }

    // Resolve connectionId from connect_code
    const connectData = await kvGetJson(`chatgpt_ga4_connect:${connect_code}`);
    if (!connectData || (connectData.expires && connectData.expires < Date.now())) {
      return res.status(400).send("Invalid or expired connect_code.");
    }

    const connectionId = connectData.connectionId;
    if (!connectionId) {
      return res.status(400).send("Invalid connect_code data.");
    }

    const authState = await readAuthState(state, true);
    if (!authState) {
      return res.status(400).send("Invalid or expired OAuth state.");
    }

    const { code_verifier } = authState;

    const origin = inferOrigin(req);
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
    const tokens = await exchangeCodeForTokens(String(code), code_verifier, redirectUri);

    // Store GA4 tokens against connectionId
    await saveGA4TokensForConnection(connectionId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });

    // Optionally try to link connectionId to a user via email (for premium checks)
    let propertyId = null;
    try {
      const uiResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const ui = await uiResp.json();
      if (ui?.email) {
        // Store email with connection for future user linking
        await kvSetJson(
          `chatgpt_connection:${connectionId}`,
          { email: ui.email, linkedAt: Date.now() },
          60 * 60 * 24 * 30 // 30 days
        );
      }

      // Get first property for prefetching
      const propsResp = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=1", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const propsData = await propsResp.json();
      if (propsData?.accountSummaries?.[0]?.propertySummaries?.[0]?.property) {
        propertyId = propsData.accountSummaries[0].propertySummaries[0].property;
      }
    } catch (e) {
      console.error("[chatgpt/ga4/callback] Failed to capture email/property:", e?.message || e);
      // Continue - email capture is optional
    }

    // Prefetch GA4 summary in background (best-effort, don't block)
    if (propertyId) {
      prefetchGA4Summary(connectionId, propertyId).catch(e => {
        console.error("[chatgpt/ga4/callback] Prefetch failed:", e?.message || e);
      });
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
