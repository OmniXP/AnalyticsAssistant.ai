// web/lib/server/ga4-session.js
// Single source of truth for: session cookie, Google tokens, bearer refresh.
// Uses Upstash KV via UPSTASH_KV_REST_URL / UPSTASH_KV_REST_TOKEN.

const SESSION_COOKIE_NAME = "aa_sid";
const KV_URL = process.env.UPSTASH_KV_REST_URL || "";
const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN || "";

// ---------- small cookie helpers (server-only) ----------
function parseCookie(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(";").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf("=");
    const k = i >= 0 ? p.slice(0, i) : p;
    const v = i >= 0 ? p.slice(i + 1) : "";
    if (!(k in out)) out[k] = decodeURIComponent(v);
  }
  return out;
}

function serializeCookie(name, value, options = {}) {
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...options,
  };
  const segs = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`];
  if (opts.maxAge != null) segs.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires instanceof Date) segs.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.domain) segs.push(`Domain=${opts.domain}`);
  if (opts.secure) segs.push("Secure");
  if (opts.httpOnly) segs.push("HttpOnly");
  if (opts.sameSite) segs.push(`SameSite=${opts.sameSite}`);
  return segs.join("; ");
}

function setCookie(res, name, value, options = {}) {
  const headerValue = serializeCookie(name, value, options);
  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", headerValue);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, headerValue]);
  else res.setHeader("Set-Cookie", [prev, headerValue]);
}

export function readSidFromCookie(req) {
  const cookies = parseCookie(req.headers?.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function ensureSid(req, res) {
  const sid = readSidFromCookie(req);
  if (sid) return sid;
  const fresh = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  setCookie(res, SESSION_COOKIE_NAME, fresh, { maxAge: 60 * 60 * 24 * 365 });
  return fresh;
}

export { SESSION_COOKIE_NAME };

// ---------- Upstash KV tiny client ----------
async function kvFetch(path, init) {
  if (!KV_URL || !KV_TOKEN) {
    const e = new Error("Upstash KV not configured");
    e.code = "KV_MISSING";
    throw e;
  }
  const r = await fetch(`${KV_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave as text */ }
  return { ok: r.ok, status: r.status, body: json ?? text };
}

async function kvGet(key) {
  const { ok, body } = await kvFetch(`/get/${encodeURIComponent(key)}`, { method: "GET" });
  if (!ok) return null;
  // Upstash KV returns: { result: "<string|null>" }
  return body?.result ?? null;
}

async function kvSet(key, value, ttlSeconds) {
  const url = ttlSeconds != null
    ? `/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodeURIComponent(value)}`
    : `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const { ok } = await kvFetch(url, { method: "POST" });
  return ok;
}

async function kvDel(key) {
  await kvFetch(`/del/${encodeURIComponent(key)}`, { method: "POST" });
}

// ---------- Google token storage ----------
function keyAccess(sid) { return `aa:access:${sid}`; }      // optional, not required by logic
function keyGoogle(sid) { return `aa:ga:${sid}`; }          // canonical storage

export function isExpired(tokens) {
  if (!tokens) return true;
  const now = Date.now();
  const expMs =
    tokens.expires_at != null
      ? Number(tokens.expires_at)
      : tokens.expiry_date != null
      ? Number(tokens.expiry_date)
      : null;

  if (!expMs) return true;

  // safety buffer: refresh if within 60 seconds of expiry
  return now >= (expMs - 60_000);
}

export async function saveGoogleTokens(sid, incoming) {
  if (!sid) throw new Error("saveGoogleTokens: missing sid");
  if (!incoming || typeof incoming !== "object") throw new Error("saveGoogleTokens: missing tokens");

  // Pull any existing record so we can preserve the refresh_token if Google omits it on refresh.
  const existingRaw = await kvGet(keyGoogle(sid));
  let existing = null;
  try { existing = existingRaw ? JSON.parse(existingRaw) : null; } catch { existing = null; }

  const merged = { ...(existing || {}), ...(incoming || {}) };

  // Normalise expiry -> milliseconds since epoch
  // Google's token endpoint returns either:
  //   - expires_in (seconds) on refresh
  //   - expiry_date (ms) on some flows
  if (typeof incoming.expires_in === "number") {
    merged.expires_at = Date.now() + (incoming.expires_in * 1000);
  } else if (typeof incoming.expiry_date === "number") {
    merged.expires_at = incoming.expiry_date;
  } else if (typeof existing?.expires_at === "number") {
    merged.expires_at = existing.expires_at;
  }

  // If refresh_token omitted on refresh, keep the old one.
  if (!incoming.refresh_token && existing?.refresh_token) {
    merged.refresh_token = existing.refresh_token;
  }

  // Persist canonical record
  await kvSet(keyGoogle(sid), JSON.stringify(merged));
  // Optional mirror for debugging
  await kvSet(keyAccess(sid), JSON.stringify(merged));

  return merged;
}

export async function getGoogleTokens(sid) {
  if (!sid) return null;
  const raw = await kvGet(keyGoogle(sid));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearGaTokens(sid) {
  if (!sid) return;
  await kvDel(keyGoogle(sid));
  await kvDel(keyAccess(sid));
}

async function refreshGoogleTokens(sid, tokens) {
  const refresh_token = tokens?.refresh_token;
  if (!refresh_token) throw new Error("No refresh_token available to refresh");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    grant_type: "refresh_token",
    refresh_token,
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Token refresh failed: ${resp.status} ${t}`);
  }

  const next = await resp.json();
  // next contains: access_token, expires_in, scope, token_type
  const merged = await saveGoogleTokens(sid, next);
  return merged;
}

export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return null;

  let tokens = await getGoogleTokens(sid);
  if (!tokens) return null;

  // If expired or close to expiry, refresh
  if (isExpired(tokens)) {
    try {
      tokens = await refreshGoogleTokens(sid, tokens);
    } catch (e) {
      // If refresh fails, surface null so caller can respond with 401
      return null;
    }
  }

  const token = tokens.access_token || null;
  return token;
}
