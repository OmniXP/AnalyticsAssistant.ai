// web/pages/api/dev/selfcheck.js
// Basic environment and session sanity check for GA4 + OAuth.

import { getBearerForRequest } from "../../../lib/server/ga4-session";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const googleEnv = {
      clientId: !!process.env.GOOGLE_CLIENT_ID,
      clientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || null,
      scopes: (process.env.GOOGLE_SCOPES || "").split(/\s+/).filter(Boolean),
    };

    const upstashEnv = {
      url: !!(process.env.UPSTASH_KV_REST_URL || process.env.KV_REST_API_URL),
      token: !!(process.env.UPSTASH_KV_REST_TOKEN || process.env.KV_REST_API_TOKEN),
    };

    const postAuthRedirect = process.env.POST_AUTH_REDIRECT || "/";
    const sidCookiePresent =
      (req.headers?.cookie || "").includes("aa_sid=") ||
      (req.headers?.cookie || "").includes("aa_auth=");

    const bearer = await getBearerForRequest(req);

    res.status(200).json({
      ok: true,
      time: new Date().toISOString(),
      env: { google: googleEnv, upstash: upstashEnv, postAuthRedirect },
      cookiePresent: sidCookiePresent,
      bearer: {
        hasToken: !!bearer?.token,
        sid: bearer?.sid || null,
        reason: bearer?.reason || null,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
