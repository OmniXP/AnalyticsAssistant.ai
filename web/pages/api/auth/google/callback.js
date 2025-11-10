// web/pages/api/auth/google/callback.js
import { saveGoogleTokens } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { code, state } = req.query || {};
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const root = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;
    const redirectUri = `${root}/api/auth/google/callback`;

    if (!code) return res.status(400).json({ error: "OAuth callback failed", message: "Missing code" });
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "OAuth callback failed", message: "Missing Google credentials" });
    }

    let parsedState = {};
    try {
      parsedState = JSON.parse(decodeURIComponent(state || ""));
    } catch {
      // ignore
    }
    const sid = parsedState?.sid || null;
    const postRedirect = typeof parsedState?.redirect === "string" ? parsedState.redirect : "/";

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

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      console.error("Token exchange failed:", tokenResp.status, text);
      return res.status(500).json({ error: "OAuth callback failed", message: "token_exchange_failed" });
    }

    const tokens = await tokenResp.json();

    if (!sid) {
      // We can still store against a random SID if state is missing, but better to error
      return res.status(400).json({ error: "OAuth callback failed", message: "Missing SID in state" });
    }

    await saveGoogleTokens(sid, tokens);

    // Redirect the user back to the app
    res.writeHead(302, { Location: postRedirect || "/" });
    res.end();
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).json({ error: "OAuth callback failed", message: err.message || "unknown_error" });
  }
}
