// web/pages/api/auth/google/callback.js
import { ensureSid, saveGoogleTokens, markAuthed } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const { clientId, clientSecret } = (await import("../../../../lib/server/ga4-session.js")).getGoogleEnv?.() || {};
    const redirectUri = `${origin}/api/auth/google/callback`;

    // Google sends ?code=…&state=…
    const { code, state } = req.query || {};
    if (!code) return res.status(400).send("Missing code");

    // Recover state
    let desiredRedirect = "/";
    try {
      const parsed = JSON.parse(Buffer.from(String(state || ""), "base64url").toString("utf8"));
      if (parsed?.redirect && typeof parsed.redirect === "string") desiredRedirect = parsed.redirect;
    } catch {}

    const sid = ensureSid(req, res);

    // Exchange code for tokens
    const params = new URLSearchParams();
    params.set("code", String(code));
    params.set("client_id", process.env.GOOGLE_CLIENT_ID);
    params.set("client_secret", process.env.GOOGLE_CLIENT_SECRET);
    params.set("redirect_uri", redirectUri);
    params.set("grant_type", "authorization_code");

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const tokens = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok) {
      const msg = tokens?.error_description || tokens?.error || "Token exchange failed";
      return res.status(401).send(msg);
    }

    await saveGoogleTokens({ sid, tokens });
    markAuthed(res);

    // Back to the app
    res.writeHead(302, { Location: desiredRedirect || "/" });
    return res.end();
  } catch (e) {
    return res.status(500).send(String(e?.message || e));
  }
}
