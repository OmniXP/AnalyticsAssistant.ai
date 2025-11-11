// web/lib/server/ga4-session.js
// Single source of truth for: session cookie, Upstash KV token storage, token refresh.
// Works on Vercel (fetch available). No external deps.

import crypto from "crypto";

export const SESSION_COOKIE_NAME = "aa_sid";
export const AUTH_COOKIE_NAME = "aa_auth";

// ---- Environment ----
function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
function getKvEnv() {
  const url = requiredEnv("UPSTASH_KV_REST_URL");
  const token = requiredEnv("UPSTASH_KV_REST_TOKEN");
  return { url, token };
}
function getGoogleEnv() {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""; // optional but helpful
  return { clientId, clientSecret, appUrl };
}

// ---- Cookies ----
function readCookie(req, name) {
  const raw = req.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim());
  for (const p of parts) {
    if (!p) continue;
    const i = p.indexOf("=");
    const k = i >= 0 ? p.slice(0, i) : p;
    const v = i >= 0 ? p.slice(i + 1) : "";
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}
function setCookie(res, name, value, { maxAgeDays = 365 } = {}) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const cookie = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${maxAge}`,
  ].join("; ");
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", cookie);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, cookie]);
  else res.setHeader("Set-Cookie", [prev, cookie]);
}
function clearCookie(res, name) {
  const cookie = [
    `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
  ].join("");
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", cookie);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, cookie]);
  else res.setHeader("Set-Cookie", [prev, cookie]);
}

// ---- Session id ----
export function readSidFromCookie(req) {
  return readCookie(req, SESSION_COOKIE_NAME);
}
export function ensureSid(req, res) {
  let sid = readSidFromCookie(req);
  if (!sid) {
    sid = crypto.randomUUID();
    setCookie(res, SESSION_COOKIE_NAME, sid);
  }
  return sid;
}

// ---- Upstash KV helpers ----
async function kvFetch(path, { method = "GET", body } = {}) {
  const { url, token } = getKvEnv();
  const r = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error || `KV ${method} ${path} failed (${r.status})`;
    throw new Error(msg);
  }
  return json;
}
async function kvGet(key) {
  const out = await kvFetch(`/get/${encodeURIComponent(key)}`);
  return out?.result ?? null;
}
async function kvSet(key, value) {
  // value stored as JSON string
  return kvFetch(`/set/${encodeURIComponent(key)}`, { method: "POST", body: { value: JSON.stringify(value) } });
}
async function kvDel(key) {
  return kvFetch(`/del/${encodeURIComponent(key)}`, { method: "POST" });
}

// ---- Token storage ----
function tokenKey(sid) {
  return `aa:ga:${sid}`;
}
export async function saveGoogleTokens({ sid, tokens }) {
  // expected tokens: { access_token, refresh_token?, expires_in? | expiry_date?, token_type, scope }
  const now = Date.now();
  let expiry_date = tokens.expiry_date;
  if (!expiry_date && tokens.expires_in) {
    // convert seconds to absolute ms
    expiry_date = now + Number(tokens.expires_in) * 1000 - 15000; // 15s early
  }
  const record = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || "",
    expiry_date: expiry_date || (now + 50 * 60 * 1000),
    saved_at: new Date().toISOString(),
  };
  await kvSet(tokenKey(sid), record);
  return record;
}
export async function clearGaTokens(req, res) {
  const sid = readSidFromCookie(req);
  if (sid) await kvDel(tokenKey(sid)).catch(() => {});
  clearCookie(res, AUTH_COOKIE_NAME);
}

export async function getGoogleTokens(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return null;
  const raw = await kvGet(tokenKey(sid));
  if (!raw) return null;
  // raw may already be object or JSON string
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  return obj;
}
export function isExpired(tokens) {
  const t = Number(tokens?.expiry_date || 0);
  if (!t) return true;
  return Date.now() >= t;
}

// ---- Refresh flow ----
async function refreshAccessToken(tokens) {
  const { clientId, clientSecret } = getGoogleEnv();
  const refresh_token = tokens?.refresh_token;
  if (!refresh_token) throw new Error("No refresh_token available");

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refresh_token);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(json?.error_description || json?.error || `Google token refresh failed (${r.status})`);
  }
  return {
    access_token: json.access_token,
    refresh_token: refresh_token, // keep original
    token_type: json.token_type || "Bearer",
    scope: json.scope || tokens.scope || "",
    expires_in: json.expires_in,
  };
}

// ---- Public: get bearer for any API request ----
export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return { error: "No session", bearer: null };

  let tokens = await getGoogleTokens(req);
  if (!tokens) return { error: "No tokens", bearer: null };

  if (isExpired(tokens)) {
    try {
      const refreshed = await refreshAccessToken(tokens);
      const saved = await saveGoogleTokens({ sid, tokens: refreshed });
      tokens = saved;
    } catch (err) {
      return { error: `Token refresh failed: ${String(err?.message || err)}`, bearer: null };
    }
  }

  return { bearer: tokens.access_token, error: null };
}

// ---- Convenience: mark authenticated ----
export function markAuthed(res) {
  setCookie(res, AUTH_COOKIE_NAME, "1", { maxAgeDays: 30 });
}
