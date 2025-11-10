// web/lib/server/ga4-session.js
// Resolves a Google "Bearer ..." from either a direct cookie or tokens stored in Upstash KV.

const KV_URL = process.env.UPSTASH_KV_REST_URL || process.env.UPSTASH_REST_URL || process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN || process.env.UPSTASH_REST_TOKEN || process.env.KV_REST_API_TOKEN;

function readCookie(req, name) {
  const raw = req.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf("=");
    const k = i >= 0 ? p.slice(0, i) : p;
    const v = i >= 0 ? p.slice(i + 1) : "";
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

async function kvGet(key) {
  if (!KV_URL || !KV_TOKEN) {
    const err = new Error("Upstash KV not configured");
    err.code = "NO_KV";
    throw err;
  }
  const url = `${KV_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(`KV get failed: ${r.status}`);
    err.code = "KV_ERROR";
    err.detail = j;
    throw err;
  }
  return j?.result ?? null;
}

export async function getBearerForRequest(req) {
  // 1) If a direct bearer cookie exists, use it.
  const aa_auth = readCookie(req, "aa_auth"); // expected like "Bearer ya29.a0...."
  if (aa_auth && /^Bearer\s+/.test(aa_auth)) {
    return { bearer: aa_auth, sid: null, source: "cookie:aa_auth" };
  }

  // 2) Otherwise, resolve via session id and KV.
  const sid = readCookie(req, "aa_sid");
  if (!sid) {
    const err = new Error("No session id. Reconnect Google.");
    err.code = "NO_SESSION";
    throw err;
  }

  // Keys we try in KV, newest namespace first
  const keys = [`aa:access:${sid}`, `aa:ga:${sid}`, `ga:access:${sid}`];
  let tokens = null;
  for (const k of keys) {
    const got = await kvGet(k).catch(() => null);
    if (got) {
      tokens = got;
      break;
    }
  }
  if (!tokens) {
    const err = new Error("No tokens for session. Reconnect Google.");
    err.code = "NO_TOKENS";
    throw err;
  }

  // tokens may be either a raw string or an object { access_token, expiry, token_type }
  const access = typeof tokens === "string" ? tokens : tokens.access_token;
  if (!access) {
    const err = new Error("Malformed stored tokens. Reconnect Google.");
    err.code = "NO_TOKENS";
    throw err;
  }

  return { bearer: `Bearer ${access}`, sid, source: "kv" };
}
