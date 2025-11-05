// web/pages/api/ga4/debug-session.js
// Robust diagnostics for both NextAuth session and GA (Upstash) token state.
// Never throws; always returns JSON telling you exactly what's missing.

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";

// Pull shared helpers
const {
  getAccessTokenFromRequest,
  readSessionIdFromRequest,
} = require("../../../server/ga4-session");

// Lazy import Redis only if env vars exist (so we don't crash)
function getRedisClient() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    "";

  if (!url || !token) return { client: null, urlPresent: !!url, tokenPresent: !!token };

  const { Redis } = require("@upstash/redis");
  return { client: new Redis({ url, token }), urlPresent: true, tokenPresent: true };
}

export default async function handler(req, res) {
  const out = {
    // Request context
    hasCookieHeader: !!req.headers?.cookie,
    cookieLength: (req.headers?.cookie || "").length,

    // NextAuth (app) session
    nextAuth: {
      nextauthUrl: process.env.NEXTAUTH_URL || null,
      hasSecret: !!process.env.NEXTAUTH_SECRET,
      signedIn: false,
      userEmail: null,
    },

    // Google cookie + Upstash store
    gaStore: {
      sessionCookieName: process.env.SESSION_COOKIE_NAME || "aa_auth",
      hasAppEncKey: !!process.env.APP_ENC_KEY,
      redisUrlPresent: false,
      redisTokenPresent: false,
      sidFound: false,
      upstashRecordFound: false,
      hasAccessTokenField: false,   // in Redis record
      hasRefreshTokenField: false,  // in Redis record
      expirySec: null,
      secondsUntilExpiry: null,
      getAccessTokenSucceeded: false,
      getAccessTokenError: null,
    },
  };

  try {
    // 1) NextAuth session
    try {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.email) {
        out.nextAuth.signedIn = true;
        out.nextAuth.userEmail = session.user.email;
      }
    } catch (e) {
      // We won't crash; just record that we couldn't load a session
      out.nextAuth.error = String(e?.message || e);
    }

    // 2) GA Upstash store & cookie decrypt
    const { client: redis, urlPresent, tokenPresent } = getRedisClient();
    out.gaStore.redisUrlPresent = urlPresent;
    out.gaStore.redisTokenPresent = tokenPresent;

    // Read our encrypted sid from cookie
    const sid = readSessionIdFromRequest(req);
    if (sid) {
      out.gaStore.sidFound = true;

      if (redis) {
        try {
          const rec = await redis.hgetall(`aa:ga4:${sid}`);
          if (rec && Object.keys(rec).length) {
            out.gaStore.upstashRecordFound = true;
            const now = Math.floor(Date.now() / 1000);
            const expiry = rec.expiry ? parseInt(rec.expiry, 10) : 0;
            out.gaStore.hasAccessTokenField = !!rec.access_token;
            out.gaStore.hasRefreshTokenField = !!rec.refresh_token;
            out.gaStore.expirySec = Number.isFinite(expiry) ? expiry : null;
            out.gaStore.secondsUntilExpiry = expiry ? (expiry - now) : null;
          }
        } catch (e) {
          out.gaStore.upstashReadError = String(e?.message || e);
        }
      } else {
        out.gaStore.upstashReadError = "Redis client not initialised (missing URL/TOKEN env).";
      }
    }

    // 3) Try to retrieve a working Google access token (using helper)
    try {
      const at = await getAccessTokenFromRequest(req);
      out.gaStore.getAccessTokenSucceeded = !!at;
    } catch (e) {
      out.gaStore.getAccessTokenError = String(e?.message || e);
    }

    return res.status(200).json(out);
  } catch (e) {
    // Failsafe: never crash
    return res.status(200).json({ error: "debug failed unexpectedly", details: String(e?.message || e), snapshot: out });
  }
}
