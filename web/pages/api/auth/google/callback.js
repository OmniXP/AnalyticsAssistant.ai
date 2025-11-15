// web/pages/api/auth/google/callback.js
export const runtime = "nodejs";

import { saveGoogleTokens, SESSION_COOKIE_NAME } from "../../../../server/ga4-session.js";

function computeBaseUrl(req) {
  const forced = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL;
  if (forced) return forced.replace(/\/$/, "");
  const host = req.headers.get?.("host") || req.headers?.host;
  const proto = req.headers.get?.("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function resolveRedirectUri(req) {
  const fromEnv = process.env.GOOGLE_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  const base = computeBaseUrl(req);
  return `${base}/api/auth/google/callback`;
}

export default async function handler(req, res) {
  try {
    const { code, state: stateB64 } = req.query || {};
    if (!code) throw new Error("Missing ?code in callback");

    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret =
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Missing Google OAuth env (client id/secret)");

    let sid = null, redirect = "/";
    if (stateB64) {
      try {
        const state = JSON.parse(Buffer.from(stateB64, "base64url").toString("utf8"));
        sid = state.sid || null;
        redirect = typeof state.redirect === "string" ? state.redirect : "/";
      } catch {}
    }
    if (!sid) {
      const cookie = req.headers.get?.("cookie") || req.headers?.cookie || "";
      const m = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      sid = m ? decodeURIComponent(m[1]) : null;
    }
    if (!sid) throw new Error("No SID for token save");

    const redirectUri = resolveRedirectUri(req);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      const err = tokenJson?.error || `${tokenRes.status} ${tokenRes.statusText}`;
      return res.status(400).json({ ok: false, error: `Token exchange failed: ${err}`, details: tokenJson });
    }
    if (!tokenJson?.access_token) {
      return res.status(400).json({ ok: false, error: "saveGoogleTokens: missing access_token", details: tokenJson });
    }

    await saveGoogleTokens(sid, tokenJson);

    res.setHeader("Set-Cookie", `aa_auth=1; Path=/; SameSite=Lax; Secure`);
    res.writeHead(302, { Location: redirect || "/" });
    res.end();
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
