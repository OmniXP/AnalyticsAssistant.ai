// web/pages/api/auth/google/callback.js
import crypto from "crypto";
import { readAuthState, exchangeCodeForTokens, inferOrigin } from "../../../../server/google-oauth.js";
import { saveGoogleTokens, ensureSid, readSidFromCookie } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { code, state, error } = req.query || {};
    
    // Handle OAuth errors
    if (error) {
      return res.status(400).json({ ok: false, error: `OAuth error: ${error}` });
    }
    
    // Validate required parameters
    if (!code) {
      return res.status(400).json({ ok: false, error: "Missing code" });
    }
    if (!state) {
      return res.status(400).json({ ok: false, error: "Missing state" });
    }

    // Read and validate state from Upstash (this also deletes it)
    const authState = await readAuthState(state, true);
    if (!authState) {
      return res.status(400).json({ ok: false, error: "Invalid or expired state" });
    }

    const { code_verifier, desiredRedirect } = authState;

    // Exchange code for tokens using PKCE
    const origin = inferOrigin(req);
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;
    const tokens = await exchangeCodeForTokens(String(code), code_verifier, redirectUri);

    // Get existing session ID from cookie, or create a new one
    // This ensures we reuse the same session if the user already has a cookie
    const existingSid = readSidFromCookie(req);
    const sid = ensureSid(res, existingSid); // Reuse existing SID if available
    
    console.log("[OAuth Callback] Using session ID:", sid, existingSid ? "(reused)" : "(new)");

    // Save tokens against the session
    await saveGoogleTokens({
      sid,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });
    
    console.log("[OAuth Callback] Saved tokens for session:", sid);

    // Redirect back to the app (use desiredRedirect from state, or default to /onboard?connected=true)
    // Note: Cookie is already set by ensureSid() above
    const redirectTo = desiredRedirect || "/onboard?connected=true";
    res.writeHead(302, { Location: redirectTo });
    res.end();
  } catch (e) {
    console.error("OAuth callback error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
