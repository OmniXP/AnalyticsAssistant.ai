// web/pages/api/dev/selfcheck.js
// Lightweight environment & session self-check.

import { getCookie } from "../../../lib/server/cookies";
import { getBearerForRequest, SESSION_COOKIE_NAME } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const env = {
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL || null,
      upstashUrl: !!process.env.UPSTASH_KV_REST_URL,
      upstashToken: !!process.env.UPSTASH_KV_REST_TOKEN,
      googleClientId: !!process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      postAuthRedirect: process.env.POST_AUTH_REDIRECT || "/",
    };

    const sidCookie = getCookie(req, SESSION_COOKIE_NAME);
    const legacyAuth = getCookie(req, "aa_auth");
    const bearer = await getBearerForRequest(req).catch(() => null);

    res.status(200).json({
      ok: true,
      env,
      cookies: {
        [SESSION_COOKIE_NAME]: !!sidCookie,
        aa_auth: !!legacyAuth,
      },
      hasBearer: !!bearer,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
