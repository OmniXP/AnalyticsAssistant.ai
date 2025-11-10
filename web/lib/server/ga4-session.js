// web/lib/server/ga4-session.js
// Session + token helpers for API routes. Server-only.

import { getCookie, setCookie } from "./cookies.js";

export const SESSION_COOKIE_NAME = "aa_sid";

// ---------- SID helpers ----------
export function readSidFromCookie(req) {
  return getCookie(req, SESSION_COOKIE_NAME);
}

export function ensureSid(req, res) {
  let sid = readSidFromCookie(req);
  if (!sid) {
    sid = crypto.randomUUID();
    // 30 days, httpOnly so it cannot be read in client JS.
    setCookie(res, SESSION_COOKIE_NAME, sid, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return sid;
}

// ---------- Upstash KV (REST) ----------
function getKvConfig() {
  const url = process.env.UPSTASH_KV_REST_URL || process.env.UPSTASH_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN || process.env.UPSTASH_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Upstash KV not configured");
  return { url: url.replace(/\/+$/, ""), token };
}

async function kvGet(key) {
  const { url, token } = getKvConfig();
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`KV get failed: ${r.status}`);
  const j = await r.json();
  return j?.result ?? null;
}

async function kvSet(key, value, opts = {}) {
  const { url, token } = getKvConfig();
  const qs = [];
  if (opts.ex) qs.push(`ex=${encodeURIComponent(String(opts.ex))}`); // seconds
  const suffix = qs.length ? `?${qs.join("&")}` : "";
  const r = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${suffix}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`KV set failed: ${r.status}`);
  return true;
}

async function kvDel(key) {
  const { url, token } = getKvConfig();
  const r = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`KV del failed: ${r.status}`);
  return true;
}

function tokensKey(sid) {
  return `aa:ga:${sid}`;
}

// ---------- Google token helpers ----------
export async function saveGoogleTokens(sid, tokenResponse) {
  // tokenResponse shape from Google:
  // { access_token, expires_in, refresh_token?, scope, token_type }
  const now = Math.floor(Date.now() / 1000);
  const expires_at = now + Number(tokenResponse.expires_in || 0);

  const toStore = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || null,
    token_type: tokenResponse.token_type || "Bearer",
    scope: tokenResponse.scope || "",
    expires_at, // epoch seconds
  };

  await kvSet(tokensKey(sid), JSON.stringify(toStore), { ex: 60 * 60 * 24 * 30 }); // 30 days
  return toStore;
}

export async function getGoogleTokens(sid) {
  const raw = await kvGet(tokensKey(sid));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearGaTokens(sid) {
  try {
    await kvDel(tokensKey(sid));
  } catch {
    // ignore
  }
}

export function isExpired(tokenSet, skewSeconds = 60) {
  if (!tokenSet?.expires_at) return true;
  const now = Math.floor(Date.now() / 1000);
  return now >= (Number(tokenSet.expires_at) - skewSeconds);
}

export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) throw new Error("No SID");
  const tokens = await getGoogleTokens(sid);
  if (!tokens?.access_token) throw new Error("No access token");
  if (isExpired(tokens)) throw new Error("Access token expired");
  return `Bearer ${tokens.access_token}`;
}
