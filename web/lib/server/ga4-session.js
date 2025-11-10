// web/lib/server/ga4-session.js
// Server-side helpers for SID cookies, Upstash KV, and Google OAuth token storage.

const SESSION_COOKIE_NAME = "aa_sid";

// --- Simple cookie helpers (server only) ---
function parseCookies(req) {
  const raw = req.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  const out = {};
  for (const p of parts) {
    const i = p.indexOf("=");
    const k = i >= 0 ? p.slice(0, i) : p;
    const v = i >= 0 ? decodeURIComponent(p.slice(i + 1)) : "";
    out[k] = v;
  }
  return out;
}

function setCookie(res, name, value, options = {}) {
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...options,
  };

  const segments = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`];
  if (opts.maxAge != null) segments.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires instanceof Date) segments.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.domain) segments.push(`Domain=${opts.domain}`);
  if (opts.secure) segments.push("Secure");
  if (opts.httpOnly) segments.push("HttpOnly");
  if (opts.sameSite) segments.push(`SameSite=${opts.sameSite}`);
  const headerValue = segments.join("; ");

  const prev = res.getHeader("Set-Cookie");
  if (!prev) res.setHeader("Set-Cookie", headerValue);
  else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, headerValue]);
  else res.setHeader("Set-Cookie", [prev, headerValue]);
}

// --- Upstash KV minimal client ---
function getUpstashConfig() {
  const url = process.env.UPSTASH_KV_REST_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function kvGet(key) {
  const cfg = getUpstashConfig();
  if (!cfg) throw new Error("Upstash KV not configured");
  const r = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: "no-store",
  });
  const j = await r.json();
  return j?.result ?? null;
}

async function kvSet(key, value, opts = {}) {
  const cfg = getUpstashConfig();
  if (!cfg) throw new Error("Upstash KV not configured");
  const url = new URL(`${cfg.url}/set/${encodeURIComponent(key)}`);
  if (opts.nx) url.searchParams.set("nx", "true");
  if (opts.ex) url.searchParams.set("ex", String(opts.ex));
  const r = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}` },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
  const j = await r.json();
  return j?.result ?? null;
}

async function kvDel(key) {
  const cfg = getUpstashConfig();
  if (!cfg) throw new Error("Upstash KV not configured");
  const r = await fetch(`${cfg.url}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const j = await r.json();
  return j?.result ?? null;
}

// --- SID helpers ---
function readSidFromCookie(req) {
  const c = parseCookies(req);
  return c[SESSION_COOKIE_NAME] || null;
}

function makeSid() {
  // Simple UUID v4-ish
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ensureSid(req, res) {
  let sid = readSidFromCookie(req);
  if (!sid) {
    sid = makeSid();
    setCookie(res, SESSION_COOKIE_NAME, sid, { maxAge: 60 * 60 * 24 * 365 }); // 1 year
  }
  return sid;
}

// --- Google tokens storage ---
const KEY_USER_ACCESS = (sid) => `aa:access:${sid}`; // general user access token
const KEY_GA_ACCESS = (sid) => `aa:ga:${sid}`;       // GA specific access token

async function saveGoogleTokens(sid, tokens) {
  // Persist both keys for compatibility
  const payload = {
    ...tokens,
    saved_at: new Date().toISOString(),
  };
  await kvSet(KEY_USER_ACCESS(sid), JSON.stringify(payload));
  await kvSet(KEY_GA_ACCESS(sid), JSON.stringify(payload));
  return true;
}

async function getGoogleTokens(sid) {
  const raw = (await kvGet(KEY_GA_ACCESS(sid))) || (await kvGet(KEY_USER_ACCESS(sid)));
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return null; }
}

function isExpired(tokens) {
  // Support both expiry_date (ms) and expires_at (unix seconds)
  const nowMs = Date.now();
  if (tokens.expiry_date) return Number(tokens.expiry_date) <= nowMs - 5000;
  if (tokens.expires_at) return Number(tokens.expires_at) * 1000 <= nowMs - 5000;
  return false; // if unknown, assume valid to try
}

async function clearGaTokens(sid) {
  await kvDel(KEY_GA_ACCESS(sid));
  await kvDel(KEY_USER_ACCESS(sid));
}

// Returns "Bearer <token>" or throws with an explicit message.
async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) throw new Error("No SID cookie");
  const tokens = await getGoogleTokens(sid);
  if (!tokens?.access_token) throw new Error("No Google access token");
  if (isExpired(tokens)) throw new Error("Google token expired");
  return `Bearer ${tokens.access_token}`;
}

module.exports = {
  SESSION_COOKIE_NAME,
  // cookies
  readSidFromCookie,
  ensureSid,
  // kv
  kvGet, kvSet, kvDel, getUpstashConfig,
  // google
  saveGoogleTokens,
  getGoogleTokens,
  isExpired,
  clearGaTokens,
  getBearerForRequest,
};
