// web/server/ga4-session.js
// Single source of truth for GA session cookie handling + Upstash token store.

const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

// ---- ENV ----
const APP_ENC_KEY = process.env.APP_ENC_KEY || "change_me_please_change_me_please_";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  "";
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  "";

// Init Redis if envs exist
let redis = null;
if (REDIS_URL && REDIS_TOKEN) {
  redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
}

// ---- Utils ----
function nowSec() { return Math.floor(Date.now() / 1000); }
function b64ToBufUrlSafe(str) { return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64"); }
function shaKey() { return crypto.createHash("sha256").update(APP_ENC_KEY).digest(); }

function decryptCookiePayload(urlSafeB64) {
  const raw = b64ToBufUrlSafe(urlSafeB64);
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = shaKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

// ---- Public: read sid from request cookie ----
function readSessionIdFromRequest(req) {
  const cookieHeader = req?.headers?.cookie || "";
  if (!cookieHeader) return null;
  const pair = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((p) => p.startsWith(SESSION_COOKIE_NAME + "="));
  if (!pair) return null;
  const val = decodeURIComponent(pair.split("=").slice(1).join("="));
  try {
    const json = decryptCookiePayload(val);
    const { sid } = JSON.parse(json);
    return sid || null;
  } catch {
    return null;
  }
}

// ---- Upstash helpers ----
async function kvGet(sessionId) {
  if (!redis) return null;
  const rec = await redis.hgetall(`aa:ga4:${sessionId}`);
  return rec && Object.keys(rec).length ? rec : null;
}
async function kvSet(sessionId, data) {
  if (!redis) return;
  await redis.hset(`aa:ga4:${sessionId}`, data);
}
async function kvDel(sessionId) {
  if (!redis) return;
  await redis.del(`aa:ga4:${sessionId}`);
}

// ---- Google token refresh ----
async function refreshAccessToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return await res.json();
}

// ---- Public: get usable access token from this request ----
async function getAccessTokenFromRequest(req) {
  const sid = readSessionIdFromRequest(req);
  if (!sid) return null;

  const rec = await kvGet(sid);
  if (!rec) return null;

  const now = nowSec();
  const expiry = rec.expiry ? parseInt(rec.expiry, 10) : 0;

  if (rec.access_token && expiry && expiry > now + 60) {
    return rec.access_token;
  }

  if (!rec.refresh_token) return null;

  const refreshed = await refreshAccessToken(rec.refresh_token);
  const updated = {
    refresh_token: rec.refresh_token,
    access_token: refreshed.access_token || "",
    expiry: String(now + (refreshed.expires_in || 3600)),
    created_at: rec.created_at || String(Date.now()),
  };
  await kvSet(sid, updated);
  return updated.access_token || null;
}

// diagnostics (no secrets)
function appEncKeyFingerprint() {
  return crypto.createHash("sha256").update(APP_ENC_KEY).digest("hex").slice(0, 8);
}

module.exports = {
  getAccessTokenFromRequest,
  readSessionIdFromRequest,
  kvSet, kvGet, kvDel,
  appEncKeyFingerprint,
  SESSION_COOKIE_NAME,
  REDIS_URL_PRESENT: !!REDIS_URL,
  REDIS_TOKEN_PRESENT: !!REDIS_TOKEN,
};
