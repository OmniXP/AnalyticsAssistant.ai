// web/lib/server/ga4-session.js
/* eslint-disable no-console */
import crypto from "crypto";

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SESSION_COOKIE_NAME: _SESSION_COOKIE_NAME = "aa_sid",
  SESSION_COOKIE_SECRET = "change-me",
} = process.env;

// Export SESSION_COOKIE_NAME for use in other modules
export const SESSION_COOKIE_NAME = _SESSION_COOKIE_NAME;

// ---- Upstash KV helpers for token storage ----
const KV_URL = process.env.KV_URL || process.env.UPSTASH_KV_REST_URL || "";
const KV_TOKEN = process.env.KV_TOKEN || process.env.UPSTASH_KV_REST_TOKEN || "";

// Fallback in-memory store for local development when KV is not configured
const tokenStore = new Map();

// Check if KV is configured
const hasKV = !!(KV_URL && KV_TOKEN);

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

// KV storage helpers with fallback to in-memory store
async function kvGet(key) {
  if (!hasKV) {
    // Fallback to in-memory store for local development
    return tokenStore.get(key) || null;
  }
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
  if (!hasKV) {
    // Fallback to in-memory store for local development
    tokenStore.set(key, value);
    return "OK";
  }
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

// Generic JSON helpers so other modules (e.g. usage limits) can reuse the same KV wiring
export async function kvGetJson(key) {
  return await kvGet(key);
}

export async function kvSetJson(key, value, ttlSec) {
  return await kvSet(key, value, ttlSec);
}

async function kvDel(key) {
  if (!hasKV) {
    // Fallback to in-memory store for local development
    tokenStore.delete(key);
    return;
  }
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
  if (!raw) return null;
  
  // Support both aa_sid (new) and aa_auth (legacy) cookie names for backwards compatibility
  const cookieNames = [SESSION_COOKIE_NAME, "aa_auth", "aa_sid"];
  const cookies = raw.split(/;\s*/).map(c => c.trim());
  
  for (const cookieName of cookieNames) {
    const cookiePattern = `${cookieName}=`;
    const m = cookies.find(c => c.startsWith(cookiePattern));
    if (m) {
      const value = m.substring(cookiePattern.length).trim();
      if (!value) continue;
      
      try {
        return decodeURIComponent(value);
      } catch (e) {
        // If decoding fails, return as-is (might already be decoded)
        return value;
      }
    }
  }
  
  return null;
}

export function ensureSid(res, sid) {
  const value = sid || crypto.randomUUID();
  // Only use Secure flag in production (HTTPS), not in local development (HTTP)
  const isSecure = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const secureFlag = isSecure ? "Secure; " : "";
  // Use SameSite=Lax for both dev and prod - it works for same-origin requests
  // SameSite=None requires Secure, which doesn't work on localhost HTTP
  const sameSite = "SameSite=Lax";
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; ${secureFlag}HttpOnly; ${sameSite}; Max-Age=${60 * 60 * 24 * 365}`;
  res.setHeader("Set-Cookie", cookie);
  console.log("[ensureSid] Setting cookie:", SESSION_COOKIE_NAME, "=", value.substring(0, 20) + "...", "SameSite=" + sameSite);
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

// ---- Store GA4 tokens keyed by email (ChatGPT server-to-server)
export async function saveGoogleTokensForEmail({ email, access_token, refresh_token, expires_in }) {
  if (!email) throw new Error("saveGoogleTokensForEmail: missing email");
  if (!access_token) throw new Error("saveGoogleTokensForEmail: missing access_token");

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + Math.max(30, Number(expires_in || 0) - 30);
  const normalizedEmail = String(email).toLowerCase();
  const prev = (await getGoogleTokensForEmail(normalizedEmail)) || {};
  const tokenData = {
    access_token,
    refresh_token: refresh_token || prev.refresh_token || "",
    expiry,
  };
  await kvSet(`ga4:user:${normalizedEmail}`, tokenData, 60 * 60 * 24 * 30);
  return { ok: true };
}

export async function getGoogleTokensForEmail(email) {
  if (!email) return null;
  const normalizedEmail = String(email).toLowerCase();
  return await kvGet(`ga4:user:${normalizedEmail}`);
}

export async function getGoogleTokens(sid) {
  if (!sid) return null;
  return await kvGet(`ga4_tokens:${sid}`);
}

export async function clearGoogleTokens(sid) {
  if (!sid) return;
  await kvDel(`ga4_tokens:${sid}`);
}

// Store GA4 tokens keyed by userId for server-initiated flows (e.g., ChatGPT Actions)
export async function saveGoogleTokensForUser({ userId, access_token, refresh_token, expires_in }) {
  if (!userId) throw new Error("saveGoogleTokensForUser: missing userId");
  if (!access_token) throw new Error("saveGoogleTokensForUser: missing access_token");

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + Math.max(30, Number(expires_in || 0) - 30);
  const prev = (await getGoogleTokensForUser(userId)) || {};
  const tokenData = {
    access_token,
    refresh_token: refresh_token || prev.refresh_token || "",
    expiry,
  };
  await kvSet(`ga4_user_tokens:${userId}`, tokenData, 60 * 60 * 24 * 30);
  return { ok: true };
}

export async function getGoogleTokensForUser(userId) {
  if (!userId) return null;
  return await kvGet(`ga4_user_tokens:${userId}`);
}

export async function clearGoogleTokensForUser(userId) {
  if (!userId) return;
  await kvDel(`ga4_user_tokens:${userId}`);
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
  console.log("[getBearerForRequest] Starting, cookie header:", req.headers?.cookie?.substring(0, 100) || "none");

  // ChatGPT OAuth bearer (server-to-server)
  const authHeader = req.headers?.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const tokenData = await kvGetJson(`chatgpt:oauth:token:${token}`);
    if (tokenData?.email) {
      const email = String(tokenData.email).toLowerCase();
      console.log("[ga4] auth=chatgpt", { email });
      const bearer = await getBearerForEmail(email);
      if (!bearer) {
        console.log("[ga4] missing_user_ga4_tokens", { email });
        throw new Error("Google Analytics not connected. Connect GA4 in the app and try again.");
      }
      req._chatgptEmail = email;
      req._chatgptScope = tokenData.scope || "";
      return bearer;
    }
  }

  const sid = readSidFromCookie(req);
  console.log("[getBearerForRequest] Extracted SID:", sid ? sid.substring(0, 20) + "..." : "null");
  if (!sid) {
    const cookieHeader = req.headers?.cookie || "none";
    console.error("[getBearerForRequest] No session cookie found.");
    console.error("[getBearerForRequest] Cookie header:", cookieHeader.substring(0, 200));
    console.error("[getBearerForRequest] Looking for cookies:", [SESSION_COOKIE_NAME, "aa_auth", "aa_sid"]);
    throw new Error("Google session expired or missing. Click \"Connect Google Analytics\" to re-authorise, then run again.");
  }

  console.log("[getBearerForRequest] Fetching tokens for SID:", sid.substring(0, 20) + "...");
  const rec = await getGoogleTokens(sid);
  console.log("[getBearerForRequest] Tokens found:", !!rec, rec ? "expired:" + isExpired(rec) : "none");
  if (!rec) {
    console.error("[getBearerForRequest] No tokens found for session:", sid);
    throw new Error("Google session expired or missing. Click \"Connect Google Analytics\" to re-authorise, then run again.");
  }

  if (!isExpired(rec)) {
    console.log("[getBearerForRequest] Token not expired, returning access token");
    return rec.access_token;
  }

  // expired -> refresh
  console.log("[getBearerForRequest] Token expired, refreshing...");
  if (!rec.refresh_token) throw new Error("No refresh token");
  const refreshed = await refreshAccessToken(rec.refresh_token);
  await saveGoogleTokens({
    sid,
    access_token: refreshed.access_token,
    refresh_token: rec.refresh_token, // Google may not resend it
    expires_in: refreshed.expires_in,
  });
  const latest = await getGoogleTokens(sid);
  console.log("[getBearerForRequest] Token refreshed, returning access token");
  return latest.access_token ? latest.access_token : refreshed.access_token;
}

// Get GA4 bearer token keyed by userId (used for ChatGPT Actions / server calls).
export async function getBearerForUser(userId) {
  if (!userId) throw new Error("Missing userId");
  console.log("[getBearerForUser] Fetching tokens for user:", userId);
  const rec = await getGoogleTokensForUser(userId);
  if (!rec) {
    console.error("[getBearerForUser] No tokens found for user:", userId);
    throw new Error("Google session expired or missing. Click \"Connect Google Analytics\" to re-authorise, then run again.");
  }
  if (!isExpired(rec)) {
    return rec.access_token;
  }
  console.log("[getBearerForUser] Token expired, attempting refresh");
  if (!rec.refresh_token) {
    throw new Error("No refresh token");
  }
  const refreshed = await refreshAccessToken(rec.refresh_token);
  await saveGoogleTokensForUser({
    userId,
    access_token: refreshed.access_token,
    refresh_token: rec.refresh_token,
    expires_in: refreshed.expires_in,
  });
  const latest = await getGoogleTokensForUser(userId);
  return latest?.access_token || refreshed.access_token;
}

// ---- GA4 bearer by email (ChatGPT server-to-server)
export async function getBearerForEmail(email) {
  if (!email) throw new Error("Missing email");
  const rec = await getGoogleTokensForEmail(email);
  if (!rec) return null;
  if (!isExpired(rec)) return rec.access_token;
  if (!rec.refresh_token) throw new Error("No refresh token");
  const refreshed = await refreshAccessToken(rec.refresh_token);
  await saveGoogleTokensForEmail({
    email,
    access_token: refreshed.access_token,
    refresh_token: rec.refresh_token,
    expires_in: refreshed.expires_in,
  });
  const latest = await getGoogleTokensForEmail(email);
  return latest?.access_token || refreshed.access_token;
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
