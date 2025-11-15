// web/pages/api/auth/google/callback.js
export const runtime = "nodejs";

import { saveGoogleTokens } from "../../../../server/ga4-session.js";

function computeBaseUrl(req) {
  const forced = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL;
  if (forced) return forced.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function resolveRedirectUri(req) {
  return (process.env.GOOGLE_REDIRECT_URI || `${computeBaseUrl(req)}/api/auth/google/callback`).replace(/\/$/, "");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const { code, state: stateB64 } = req.query || {};
    if (!code) return res.status(400).json({ ok: false, error: "Missing code" });
    if (!stateB64) return res.status(400).json({ ok: false, error: "Missing state" });

    let parsedState;
    try {
      parsedState = JSON.parse(Buffer.from(String(stateB64), "base64url").toString("utf8"));
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid state" });
    }

    const sid = parsedState?.sid;
    const redirectAfter = parsedState?.redirect || "/";
    if (!sid) return res.status(400).json({ ok: false, error: "Missing sid in state" });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Missing Google client env");

    const redirectUri = resolveRedirectUri(req);

    const body = new URLSearchParams({
      code: String(code),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const rsp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const json = await rsp.json().catch(() => ({}));
    if (!rsp.ok) {
      return res.status(502).json({ ok: false, error: `token-exchange-failed: ${rsp.status}`, details: json });
    }

    const { access_token, refresh_token, expires_in, id_token, token_type } = json || {};
    if (!access_token) {
      return res.status(500).json({ ok: false, error: "saveGoogleTokens: missing access_token", details: json });
    }

    // Persist tokens bound to this SID
    await saveGoogleTokens(sid, {
      access_token,
      refresh_token, // may be undefined if Google didn’t return it this time
      expires_in,
      id_token,
      token_type,
      obtained_at: Date.now(),
    });

    // Optional: drop a quick hint cookie for your UI (not security sensitive)
    res.setHeader("Set-Cookie", [
      `aa_auth=1; Path=/; Max-Age=3600; SameSite=Lax`,
    ]);

    // Finish: redirect back to app
    const base = computeBaseUrl(req);
    const backTo = `${base}${redirectAfter || "/"}`;
    res.writeHead(302, { Location: backTo });
    res.end();
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
