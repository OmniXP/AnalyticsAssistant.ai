// web/pages/api/auth/google/disconnect.js
const { readSessionIdFromRequest, kvSet } = require("../../../../server/ga4-session");
const { Redis } = require("@upstash/redis");
const { serializeCookie } = require("../../../../lib/cookies");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";

export default async function handler(req, res) {
  const sid = readSessionIdFromRequest(req);
  if (sid) {
    try { await redis.del(`aa:ga4:${sid}`); } catch {}
  }
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true, secure: true, sameSite: "Lax", maxAge: 0, path: "/",
  }));
  res.json({ ok: true });
}
