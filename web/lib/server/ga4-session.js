// web/lib/server/ga4-session.js
// Canonical session & token helpers for Google OAuth (GA4) using Upstash KV.
// Works in Node runtime on Vercel.

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_sid";
const AUTH_COOKIE_NAME = "aa_auth";

const KV_URL = process.env.UPSTASH_KV_REST_URL;
const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  // Do not crash module import. Fail at callsites with clear errors instead.
  // This keeps build green even if envs are missing in preview.
}

async function kv(method, path, body) {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error("Upstash KV not configured (UPSTASH_KV_REST_URL/TOKEN missing)");
  }
  const res = await fetch(`${KV_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: json };
}

async function kvSet(key, value, ttlSeconds) {
  const payload = ttlSeconds
    ? { key, value: JSON.stringify(value), ttl: ttlSeconds }
    : { key, value: JSON.stringify(value) };
  return kv("POST", "/set", payload);
}
async function kvGet(key) {
  const r = await kv("POST", "/get", { key });
  if (!r.ok) return null;
  try {
    return r.body?.result ? JSON.parse(r.body.result) : null;
  } catch {
    return null;
  }
}
async function kvDel(key) {
  return kv("POST", "/del", { key });
}

function keyGA(sid) { return `aa:ga:${sid}`; }
function keyAccess(sid) { return `aa:access:${sid}`; } // legacy alias

export function readSidFromCookie(req) {
  // req is Next.js API req; on Vercel we can still read raw header.
  const cookie = req.headers.get?.("cookie") || req.headers?.cookie || "";
  const m = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function ensureSid(req, res) {
  const existing = readSidFromCookie(req);
  if (existing) return existing;
  const sid = (globalThis.crypto?.randomUUID?.() || require("crypto").randomUUID());
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sid)}; Path=/; SameSite=Lax; HttpOnly; Secure`;
  if (typeof res.setHeader === "function") {
    res.setHeader("Set-Cookie", cookie);
  } else if (res.headers?.append) {
    res.headers.append("Set-Cookie", cookie);
  }
  return sid;
}

export async function saveGoogleTokens(sid, tokenResponse) {
  if (!tokenResponse || !tokenResponse.access_token) {
    throw new Error("saveGoogleTokens: missing access_token");
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(tokenResponse.expires_in || 3600);
  const normalized = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || null,
    token_type: tokenResponse.token_type || "Bearer",
    scope: tokenResponse.scope || "",
    id_token: tokenResponse.id_token || null,
    expires_at: now + expiresIn - 30,
    saved_at: new Date().toISOString(),
  };
  await kvSet(keyGA(sid), normalized);
  await kvSet(keyAccess(sid), normalized); // keep legacy key in sync
  return normalized;
}

export async function clearGaTokens(sid) {
  await kvDel(keyGA(sid));
  await kvDel(keyAccess(sid));
}

export async function getGoogleTokens(sid) {
  const a = await kvGet(keyAccess(sid));
  if (a?.access_token) return a;
  const b = await kvGet(keyGA(sid));
  return b || null;
}

export function isExpired(tokens) {
  if (!tokens) return true;
  const now = Math.floor(Date.now() / 1000);
  return !tokens.expires_at || tokens.expires_at <= now;
}

export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) { const e = new Error("No session"); e.status = 401; throw e; }
  const tokens = await getGoogleTokens(sid);
  if (!tokens || isExpired(tokens)) { const e = new Error("No bearer"); e.status = 401; throw e; }
  return `Bearer ${tokens.access_token}`;
}
