// web/server/ga4-session.js
// Helper to read the GA session cookie and fetch a valid access token from Upstash.

const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

// --- env & constants (must match your ga4-oauth.js) ---
const APP_ENC_KEY = process.env.APP_ENC_KEY || "change_me_please_change_me_please_";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";

// --- redis (same Upstash instance) ---
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// base64url helpers (used by ga4-oauth.js)
function b64ToBufUrlSafe(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// decrypt the cookie payload (AES-256-GCM) — mirrors ga4-oauth.js
function decrypt(payload) {
  const raw = b64ToBufUrlSafe(payload);
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = crypto.createHash("sha256").update(APP_ENC_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

// parse cookie header for our session cookie
function readSessionIdFromRequest(req) {
  const cookieHeader = req.headers?.cookie || "";
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  const pair = parts.find((p) => p.startsWith(SESSION_COOKIE_NAME + "="));
  if (!pair) return null;
  const value = decodeURIComponent(pair.split("=").slice(1).join("="));
  try {
    const json = decrypt(value);
    const { sid } = JSON.parse(json);
    return sid || null;
  } catch {
    return null;
  }
}

// --- Upstash helpers (same keys used by ga4-oauth.js) ---
async function kvGet(sessionId) {
  const rec = await redis.hgetall(`aa:ga4:${sessionId}`);
  return rec && Object.keys(rec).length ? rec : null;
}
async function kvSet(sessionId, data) {
  await redis.hset(`aa:ga4:${sessionId}`, data);
}

// --- token refresh using Google's token endpoint ---
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

// public helper: get a valid access token from the incoming request
async function getAccessTokenFromRequest(req) {
  const sid = readSessionIdFromRequest(req);
  if (!sid) return null;

  const rec = await kvGet(sid);
  if (!rec) return null;

  const now = nowSec();
  const expiry = rec.expiry ? parseInt(rec.expiry, 10) : 0;

  // still valid?
  if (rec.access_token && expiry && expiry > now + 60) {
    return rec.access_token;
  }

  // need refresh
  if (!rec.refresh_token) return null;
  const refreshed = await refreshAccessToken(rec.refresh_token);
  const updated = {
    refresh_token: rec.refresh_token,
    access_token: refreshed.access_token,
    expiry: String(now + (refreshed.expires_in || 3600)),
    created_at: rec.created_at || String(Date.now()),
  };
  await kvSet(sid, updated);
  return updated.access_token;
}

module.exports = {
  getAccessTokenFromRequest,
};
