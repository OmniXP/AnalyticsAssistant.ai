// web/pages/api/auth/google/callback.js
import crypto from "crypto";
import { readAuthState, exchangeCodeForTokens, inferOrigin } from "../../../lib/server/google-oauth.js";
import { saveGoogleTokens } from "../../../lib/server/ga4-session.js";

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

    // Generate session ID
    const sid = crypto.randomUUID();

    // Save tokens against the session
    await saveGoogleTokens({
      sid,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    });

    // Set the aa_auth cookie with the session ID
    const cookieValue = encodeURIComponent(sid);
    res.setHeader(
      "Set-Cookie",
      `aa_auth=${cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}` // 30 days
    );

    // Redirect back to the app (use desiredRedirect from state, or default to /connections)
    const redirectTo = desiredRedirect || "/connections";
    res.writeHead(302, { Location: redirectTo });
    res.end();
  } catch (e) {
    console.error("OAuth callback error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
