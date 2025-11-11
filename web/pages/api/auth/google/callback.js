// web/pages/api/auth/google/callback.js
import { ensureSid, saveGoogleTokens } from "../../../../lib/server/ga4-session.js";

async function exchangeCodeForTokens({ code, redirectUri }) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", process.env.GOOGLE_CLIENT_ID);
  params.set("client_secret", process.env.GOOGLE_CLIENT_SECRET);
  params.set("redirect_uri", redirectUri);
  params.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j?.error_description || j?.error || `Token exchange failed ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return j; // includes access_token, refresh_token, expires_in, id_token, etc.
}

export default async function handler(req, res) {
  try {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const redirectUri = `${origin}/api/auth/google/callback`;

    const { code, state } = req.query;
    if (!code) throw new Error("Missing ?code");

    // recover state
    let redirect = "/";
    try {
      const decoded = JSON.parse(Buffer.from(String(state || ""), "base64url").toString("utf8"));
      if (decoded?.redirect) redirect = decoded.redirect;
    } catch {}

    // ensure we have a sid cookie before saving
    const sid = ensureSid(req, res);

    // swap code for tokens
    const tokens = await exchangeCodeForTokens({ code, redirectUri });

    // persist against current sid
    await saveGoogleTokens(sid, res, tokens);

    // go back into the app
    res.writeHead(302, { Location: redirect });
    res.end();
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: String(e.message || e) });
  }
}
