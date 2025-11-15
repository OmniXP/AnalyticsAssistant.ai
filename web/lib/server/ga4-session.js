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

// ---- Minimal token store ----
// Replace these with your real store (Upstash/DB) if you have one.
// Keyed by sid -> { access_token, refresh_token, expiry }
const tokenStore = new Map();

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

// ---- Storage helpers (swap to Redis/DB as needed) ----
export async function saveGoogleTokens({ sid, access_token, refresh_token, expires_in }) {
  if (!sid) throw new Error("saveGoogleTokens: missing sid");
  if (!access_token) throw new Error("saveGoogleTokens: missing access_token");

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + Math.max(30, Number(expires_in || 0) - 30); // safety buffer

  const prev = tokenStore.get(sid) || {};
  tokenStore.set(sid, {
    access_token,
    refresh_token: refresh_token || prev.refresh_token, // keep old refresh if Google did not resend it
    expiry,
  });
  return { ok: true };
}

export async function getGoogleTokens(sid) {
  if (!sid) return null;
  return tokenStore.get(sid) || null;
}

export async function clearGoogleTokens(sid) {
  if (!sid) return;
  tokenStore.delete(sid);
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
