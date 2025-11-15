export const runtime = "nodejs";

import { ensureSid } from "../../../../server/ga4-session.js";

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
    const clientId =
      process.env.GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");

    const redirectUri = resolveRedirectUri(req);

    const sid = ensureSid(req, res);
    const redirect = typeof req.query?.redirect === "string" ? req.query.redirect : "/";

    const state = Buffer.from(JSON.stringify({ sid, redirect }), "utf8").toString("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/analytics.readonly",
      ].join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });

    res.status(200).json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
