// web/pages/api/auth/google/callback.js
// Handles Google OAuth callback, stores tokens in Upstash KV keyed by SID.

import { setCookie, getCookie } from "../../../../lib/server/cookies";
import { readSidFromCookie, SESSION_COOKIE_NAME } from "../../../../lib/server/ga4-session";

async function upstashSet(key, value) {
  const url = process.env.UPSTASH_KV_REST_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash KV not configured");
  const endpoint = `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, method: "POST" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || `Upstash set failed: ${r.status}`);
  return j;
}

export default async function handler(req, res) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!baseUrl || !clientId || !clientSecret) {
      return res.status(500).send("Missing Google OAuth env");
    }

    const { code, state } = req.query;
    if (!code) return res.status(400).send("Missing code");

    const parsedState = (() => {
      try { return JSON.parse(Buffer.from(String(state || ""), "base64url").toString("utf8")); }
      catch { return {}; }
    })();

    // Ensure SID exists, prefer cookie, otherwise from state, otherwise mint
    let sid = readSidFromCookie(req) || parsedState.sid || null;
    if (!sid) {
      sid = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
      setCookie(res, SESSION_COOKIE_NAME, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange the code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
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
    const tokens = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || !tokens?.access_token) {
      return res.status(500).send(`Token exchange failed: ${tokens?.error || "unknown_error"}`);
    }

    // Persist to KV
    const payload = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry_date: Date.now() + (Number(tokens.expires_in || 0) * 1000),
      token_type: tokens.token_type || "Bearer",
      scope: tokens.scope || "",
      saved_at: new Date().toISOString(),
    });

    // Store under both keys to satisfy any legacy callers
    await upstashSet(`aa:ga:${sid}`, payload);
    await upstashSet(`aa:access:${sid}`, payload);

    // Optional legacy cookie to help older checks
    setCookie(res, "aa_auth", "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    const dest = parsedState.redirect || process.env.POST_AUTH_REDIRECT || "/";
    res.writeHead(302, { Location: dest });
    res.end();
  } catch (e) {
    res.status(500).send(`Callback error: ${String(e?.message || e)}`);
  }
}
