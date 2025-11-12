// web/lib/server/ga4-session.js
import crypto from "crypto";

export const SESSION_COOKIE_NAME = "aa_sid";
const AA_AUTH_COOKIE = "aa_auth";

const KV_URL = process.env.UPSTASH_KV_REST_URL;
const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function kvHeaders() {
  if (!KV_URL || !KV_TOKEN) throw new Error("Upstash KV not configured");
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
  const raw = j?.result ?? null;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function kvDel(key) {
  const res = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: kvHeaders(),
  });
  if (!res.ok) throw new Error(`KV del failed ${res.status}`);
  return res.json().catch(() => ({}));
}

function setCookie(res, name, value, { days = 365, domain, secure = true } = {}) {
  const maxAge = days * 24 * 60 * 60;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
    domain ? `Domain=${domain}` : "",
    "HttpOnly",
  ].filter(Boolean);
  const existing = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    parts.join("; "),
  ]);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function ensureSid(req, res) {
  let sid = readCookie(req, SESSION_COOKIE_NAME);
  if (!sid) {
    sid = crypto.randomUUID();
    const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
    setCookie(res, SESSION_COOKIE_NAME, sid, { domain });
  }
  // helpful flag for UI/middleware
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
  setCookie(res, AA_AUTH_COOKIE, "1", { domain, secure: true });
  return sid;
}

export function readSidFromCookie(req) {
  return readCookie(req, SESSION_COOKIE_NAME);
}

const keyForGa = (sid) => `aa:ga:${sid}`;

export async function saveGoogleTokens(sidOrReq, res, tokens) {
  const sid = typeof sidOrReq === "string" ? sidOrReq : ensureSid(sidOrReq, res);
  const payload = normaliseTokens(tokens);
  await kvSet(keyForGa(sid), JSON.stringify(payload));
  return sid;
}

export async function clearGaTokens(req, res) {
  const sid = readSidFromCookie(req);
  if (sid) await kvDel(keyForGa(sid));
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
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
  return !exp || exp <= now + 60; // refresh if within 60s of expiry
}

function normaliseTokens(t) {
  const expires_at =
    t.expires_at ??
    (t.expiry_date
      ? Math.floor(Number(t.expiry_date) / 1000)
      : t.expires_in
      ? Math.floor(Date.now() / 1000) + Number(t.expires_in)
      : null);
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token || null, // may be null on subsequent consents
    scope: t.scope,
    token_type: t.token_type || "Bearer",
    expires_at,
    saved_at: new Date().toISOString(),
  };
}

async function refreshAccessToken(stored) {
  if (!stored?.refresh_token) {
    const err = new Error("No refresh token");
    err.code = "NO_REFRESH_TOKEN";
    throw err;
  }
  const params = new URLSearchParams();
  params.set("client_id", GOOGLE_CLIENT_ID);
  params.set("client_secret", GOOGLE_CLIENT_SECRET);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", stored.refresh_token);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j?.error_description || j?.error || `Refresh failed ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  // Google may omit refresh_token on refresh responses—preserve existing
  const merged = normaliseTokens({ ...stored, ...j, refresh_token: stored.refresh_token });
  return merged;
}

export async function getFreshTokens(req, res) {
  const sid = readSidFromCookie(req);
  if (!sid) return null;
  const key = keyForGa(sid);
  const current = await kvGet(key);
  if (!current) return null;

  if (!isExpired(current)) return current;

  try {
    const refreshed = await refreshAccessToken(current);
    await kvSet(key, JSON.stringify(refreshed));
    return refreshed;
  } catch (e) {
    // If refresh fails, keep the old record but surface expiry
    return current;
  }
}

export async function getBearerForRequest(req, res) {
  const tokens = await getFreshTokens(req, res);
  if (!tokens || isExpired(tokens)) {
    const err = new Error("No bearer");
    err.status = 401;
    throw err;
  }
  return tokens.access_token;
}
