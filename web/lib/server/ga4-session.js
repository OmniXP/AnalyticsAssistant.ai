// web/lib/server/ga4-session.js
/* eslint-disable no-console */
import crypto from "crypto";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SESSION_COOKIE_NAME = "aa_sid",
  SESSION_COOKIE_SECRET = "change-me",
} = process.env;

// ---- Upstash KV helpers for token storage ----
const KV_URL = process.env.KV_URL || process.env.UPSTASH_KV_REST_URL || "";
const KV_TOKEN = process.env.KV_TOKEN || process.env.UPSTASH_KV_REST_TOKEN || "";

// Check if we have a Redis connection string vs HTTP REST URL
const isRedisUrl = KV_URL && (KV_URL.startsWith("redis://") || KV_URL.startsWith("rediss://"));
let RedisClass = null;
let redisClient = null;

// Initialize Redis client if needed (reuse logic from google-oauth.js)
if (isRedisUrl) {
  try {
    const redisModule = require("@upstash/redis");
    RedisClass = redisModule.Redis;
  } catch (e) {
    console.error("Failed to require @upstash/redis for token storage:", e.message);
  }
}

// Parse Redis connection string (same logic as google-oauth.js)
function parseRedisConnectionString(connectionString) {
  if (!connectionString) return { url: null, token: null };
  if (connectionString.startsWith("https://")) {
    return { url: connectionString, token: KV_TOKEN };
  }
  const match = connectionString.match(/rediss?:\/\/[^:]+:([^@]+)@([^:]+)\.upstash\.io/);
  if (match) {
    return {
      url: `https://${match[2]}.upstash.io`,
      token: match[1]
    };
  }
  const endpointMatch = connectionString.match(/@([^:]+)\.upstash\.io/);
  if (endpointMatch) {
    return {
      url: `https://${endpointMatch[1]}.upstash.io`,
      token: KV_TOKEN
    };
  }
  return { url: null, token: null };
}

function getRedisClient() {
  if (!isRedisUrl) return null;
  if (redisClient) return redisClient;
  if (!RedisClass) return null;
  try {
    const { url: restApiUrl, token: redisToken } = parseRedisConnectionString(KV_URL);
    if (!restApiUrl || !redisToken) return null;
    redisClient = new RedisClass({ url: restApiUrl, token: redisToken });
    return redisClient;
  } catch (e) {
    console.error("Failed to create Redis client for token storage:", e.message);
    return null;
  }
}

// KV storage helpers
async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) return null;
  if (isRedisUrl) {
    const client = getRedisClient();
    if (client) {
      const val = await client.get(key);
      return typeof val === "string" ? JSON.parse(val) : val;
    }
  }
  const resp = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!resp.ok) return null;
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return json?.result ? (typeof json.result === "string" ? JSON.parse(json.result) : json.result) : null;
}

async function kvSet(key, value, ttlSec) {
  if (!KV_URL || !KV_TOKEN) throw new Error("Upstash KV not configured");
  const valStr = JSON.stringify(value);
  if (isRedisUrl) {
    const client = getRedisClient();
    if (client) {
      if (ttlSec != null) {
        return await client.set(key, valStr, { ex: ttlSec });
      }
      return await client.set(key, valStr);
    }
  }
  const path = ttlSec != null
    ? `/set/${encodeURIComponent(key)}/${encodeURIComponent(valStr)}?ex=${ttlSec}`
    : `/set/${encodeURIComponent(key)}/${encodeURIComponent(valStr)}`;
  const resp = await fetch(`${KV_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`KV set failed: ${await resp.text()}`);
  return "OK";
}

async function kvDel(key) {
  if (!KV_URL || !KV_TOKEN) return;
  if (isRedisUrl) {
    const client = getRedisClient();
    if (client) return await client.del(key);
  }
  await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
}

// ---- Cookie utilities ----
export function readSidFromCookie(req) {
  const raw = req.headers?.cookie || "";
  const m = raw.split(/;\s*/).find(c => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  return m ? decodeURIComponent(m.split("=", 2)[1]) : null;
}

export function ensureSid(res, sid) {
  const value = sid || crypto.randomUUID();
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
  res.setHeader("Set-Cookie", cookie);
  return value;
}

// ---- Storage helpers (using Upstash KV/Redis) ----
export async function saveGoogleTokens({ sid, access_token, refresh_token, expires_in }) {
  if (!sid) throw new Error("saveGoogleTokens: missing sid");
  if (!access_token) throw new Error("saveGoogleTokens: missing access_token");

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + Math.max(30, Number(expires_in || 0) - 30); // safety buffer

  // Get previous tokens to preserve refresh_token if Google didn't send a new one
  const prev = await getGoogleTokens(sid) || {};
  
  const tokenData = {
    access_token,
    refresh_token: refresh_token || prev.refresh_token || "", // keep old refresh if Google did not resend it
    expiry,
  };
  
  // Store with 30 day TTL (tokens expire before that, but keep storage clean)
  await kvSet(`ga4_tokens:${sid}`, tokenData, 60 * 60 * 24 * 30);
  return { ok: true };
}

export async function getGoogleTokens(sid) {
  if (!sid) return null;
  return await kvGet(`ga4_tokens:${sid}`);
}

export async function clearGoogleTokens(sid) {
  if (!sid) return;
  await kvDel(`ga4_tokens:${sid}`);
}

export function isExpired(record) {
  if (!record) return true;
  const now = Math.floor(Date.now() / 1000);
  return !record.expiry || record.expiry <= now;
}

// ---- Google OAuth exchange/refresh ----
async function exchangeCodeForTokens({ code, redirect_uri }) {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: redirect_uri || GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  if (!r.ok) {
    console.error("exchangeCodeForTokens failed", json);
    throw new Error(json.error_description || json.error || "Failed to exchange code");
  }
  return json; // { access_token, expires_in, refresh_token, ... }
}

async function refreshAccessToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  if (!r.ok) {
    console.error("refreshAccessToken failed", json);
    throw new Error(json.error_description || json.error || "Failed to refresh token");
  }
  return json; // { access_token, expires_in, ... }
}

// ---- Public: used by API routes ----
export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) throw new Error("No session cookie");

  const rec = await getGoogleTokens(sid);
  if (!rec) throw new Error("No bearer");

  if (!isExpired(rec)) return `Bearer ${rec.access_token}`;

  // expired -> refresh
  if (!rec.refresh_token) throw new Error("No refresh token");
  const refreshed = await refreshAccessToken(rec.refresh_token);
  await saveGoogleTokens({
    sid,
    access_token: refreshed.access_token,
    refresh_token: rec.refresh_token, // Google may not resend it
    expires_in: refreshed.expires_in,
  });
  const latest = await getGoogleTokens(sid);
  return `Bearer ${latest.access_token ? latest.access_token : refreshed.access_token}`;
}

// ---- Public: used by auth endpoints ----
export async function handleOAuthCallback({ req, res, code, state }) {
  // Prefer cookie sid; fall back to state.sid
  let sid = readSidFromCookie(req);
  try {
    const parsed = state ? JSON.parse(state) : null;
    if (!sid && parsed?.sid) sid = parsed.sid;
  } catch {}

  // Make sure we have a sid cookie for subsequent requests
  sid = ensureSid(res, sid);

  const tokens = await exchangeCodeForTokens({ code, redirect_uri: GOOGLE_REDIRECT_URI });
  await saveGoogleTokens({
    sid,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
  });

  return { ok: true, sid };
}

export function buildGoogleAuthUrl({ sid, redirect = "/" }) {
  const state = JSON.stringify({ sid, redirect });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("scope", [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/analytics.readonly",
  ].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function statusForRequest(req) {
  const sid = readSidFromCookie(req);
  const rec = sid ? await getGoogleTokens(sid) : null;
  return {
    ok: true,
    hasTokens: !!rec,
    expired: !rec ? true : isExpired(rec),
    connected: !!rec && !isExpired(rec),
  };
}
