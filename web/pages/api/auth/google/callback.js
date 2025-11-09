// web/pages/api/auth/google/callback.js
// Handles Google redirect, exchanges code for tokens, stores in Upstash KV keyed by aa_sid.

import { setGaTokens, readSidFromCookie } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const { code, state, error } = req.query || {};

    if (error) {
      return res.status(400).send(`Google OAuth error: ${String(error)}`);
    }
    if (!code) {
      return res.status(400).send("Missing 'code' in callback");
    }

    // Validate/parse state. Prefer sid from cookie, fall back to state.
    let sid = readSidFromCookie(req);
    try {
      const parsed = state ? JSON.parse(state) : null;
      if (!sid && parsed?.sid) sid = parsed.sid;
    } catch {}

    if (!sid) {
      return res.status(400).send("Missing session id; cannot bind tokens");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      return res.status(500).send("Google client env missing");
    }

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok) {
      return res.status(500).send(`Token exchange failed: ${JSON.stringify(tokens)}`);
    }

    await setGaTokens(sid, tokens);

    const dest = process.env.POST_AUTH_REDIRECT || "/";
    res.writeHead(302, { Location: dest });
    res.end();
  } catch (e) {
    res.status(500).send(`Callback failed: ${String(e.message || e)}`);
  }
}
