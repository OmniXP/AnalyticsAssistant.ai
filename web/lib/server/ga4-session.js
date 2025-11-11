// web/lib/server/ga4-session.js
import crypto from "crypto";

export const SESSION_COOKIE_NAME = "aa_sid";
const AA_AUTH_COOKIE = "aa_auth"; // simple flag to make middleware/UI happy

// Upstash KV REST
const KV_URL = process.env.UPSTASH_KV_REST_URL;
const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN;

// Helpers
function kvHeaders() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error("Upstash KV not configured");
  }
  return { Authorization: `Bearer ${KV_TOKEN}` };
}

async function kvSet(key, value) {
  const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: kvHeaders(),
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV set failed ${res.status}`);
  return res.json().catch(() => ({}));
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: kvHeaders(),
  });
  if (!res.ok) throw new Error(`KV get failed ${res.status}`);
  const j = await res.json().catch(() => ({}));
  // Upstash returns { result: "..." } where result may be JSON-string
  const raw = j?.result ?? null;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function kvDel(key) {
  const res = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: kvHeaders(),
  });
  if (!res.ok) throw new Error(`KV del failed ${res.status}`);
  return res.json().catch(() => ({}));
}

// Cookies
function setCookie(res, name, value, { days = 365, domain, secure = true } = {}) {
  const maxAge = days * 24 * 60 * 60;
  const d = domain || undefined; // let platform set host automatically if unset
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
    d ? `Domain=${d}` : "",
    "HttpOnly",
  ].filter(Boolean);
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(res.getHeader("Set-Cookie")) ? res.getHeader("Set-Cookie") : []).concat(
      parts.join("; ")
    ),
  ]);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// Public API
export function ensureSid(req, res) {
  let sid = readCookie(req, SESSION_COOKIE_NAME);
  if (!sid) {
    sid = crypto.randomUUID();
    // If you want to force parent domain, set NEXT_PUBLIC_COOKIE_DOMAIN=.analyticsassistant.ai
    const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
    setCookie(res, SESSION_COOKIE_NAME, sid, { domain });
  }
  // Mark “authenticated” flag so your middleware/UI shows green after callback
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
  setCookie(res, AA_AUTH_COOKIE, "1", { domain, secure: true });
  return sid;
}

export function readSidFromCookie(req) {
  return readCookie(req, SESSION_COOKIE_NAME);
}

// Token storage
const keyForGa = (sid) => `aa:ga:${sid}`;

export async function saveGoogleTokens(sidOrReq, res, tokens) {
  const sid = typeof sidOrReq === "string" ? sidOrReq : ensureSid(sidOrReq, res);
  const payload = {
    ...tokens,
    saved_at: new Date().toISOString(),
    // normalise expiry; Google libraries often use seconds or ms
    expires_at:
      tokens.expires_at ??
      (tokens.expiry_date
        ? Math.floor(Number(tokens.expiry_date) / 1000)
        : tokens.expires_in
        ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
        : null),
  };
  await kvSet(keyForGa(sid), JSON.stringify(payload));
  return sid;
}

export async function clearGaTokens(req, res) {
  const sid = readSidFromCookie(req);
  if (sid) await kvDel(keyForGa(sid));
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
  // clear cookies
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure${domain ? `; Domain=${domain}` : ""}; HttpOnly`,
    `aa_auth=; Path=/; Max-Age=0; SameSite=Lax; Secure${domain ? `; Domain=${domain}` : ""}; HttpOnly`,
  ]);
}

export async function getGoogleTokens(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return null;
  return kvGet(keyForGa(sid));
}

export function isExpired(tokens) {
  if (!tokens) return true;
  const now = Math.floor(Date.now() / 1000);
  const exp = Number(tokens.expires_at || 0);
  return !exp || exp <= now + 60; // treat “expiring within 60s” as expired
}

// For API routes needing a Bearer
export async function getBearerForRequest(req) {
  const t = await getGoogleTokens(req);
  if (!t || isExpired(t)) {
    const err = new Error("No bearer");
    err.status = 401;
    throw err;
  }
  return t.access_token;
}
