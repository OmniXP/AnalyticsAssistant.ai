// web/pages/api/dev/check-ga-cookie.js
// Checks if the server can read + decrypt the GA cookie and extract sid.
// Includes non-sensitive fingerprints to verify env consistency.

const crypto = require("crypto");

const {
  readSessionIdFromRequest,
  appEncKeyFingerprint,
  SESSION_COOKIE_NAME,
  REDIS_URL_PRESENT,
  REDIS_TOKEN_PRESENT,
} = require("../../../server/ga4-session");

function envFingerprints() {
  return {
    nextauth: {
      url: process.env.NEXTAUTH_URL || null,
      hasSecret: !!process.env.NEXTAUTH_SECRET,
    },
    ga: {
      sessionCookieName: SESSION_COOKIE_NAME,
      appEncKeyFingerprint: appEncKeyFingerprint(), // first 8 hex of sha256(APP_ENC_KEY)
    },
    upstash: {
      urlPresent: REDIS_URL_PRESENT,
      tokenPresent: REDIS_TOKEN_PRESENT,
    },
    google: {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      redirect: process.env.GA_OAUTH_REDIRECT || null,
    },
  };
}

export default async function handler(req, res) {
  try {
    const sid = readSessionIdFromRequest(req);
    res.status(200).json({
      ok: true,
      hasCookieHeader: !!req.headers?.cookie,
      cookieLength: (req.headers?.cookie || "").length,
      sidFound: !!sid,
      sid: sid || null,
      env: envFingerprints(),
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      error: String(e?.message || e),
      env: envFingerprints(),
    });
  }
}
