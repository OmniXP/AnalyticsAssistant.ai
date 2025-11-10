// web/pages/api/auth/google/callback.js
import { saveGoogleTokens } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { code, state } = req.query || {};
    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    const { sid, redirect } = JSON.parse(Buffer.from(String(state), "base64url").toString("utf8"));

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
      }),
    });

    if (!tokenResp.ok) {
      const txt = await tokenResp.text().catch(() => "");
      throw new Error(`Token exchange failed: ${tokenResp.status} ${txt}`);
    }

    const tokens = await tokenResp.json();
    await saveGoogleTokens(sid, tokens);

    res.redirect(redirect || "/");
  } catch (e) {
    res.status(500).send(`Callback error: ${e.message || String(e)}`);
  }
}
