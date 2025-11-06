// GA4 session storage + token refresh + PKCE/state management with resilient Upstash support.
// Prefers Upstash KV (KV_REST_API_URL/TOKEN). Falls back to Redis REST (UPSTASH_REDIS_REST_URL/TOKEN).
// If one backend fails with a 4xx/5xx, automatically tries the other if available.

import { getCookie, SESSION_COOKIE_NAME, decryptSID } from './cookies';

// --- ENV detection ---
const R_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

const hasRedis = !!(R_URL && R_TOKEN);
const hasKV = !!(KV_URL && KV_TOKEN);

// Prefer KV if both are present.
function getPrimaryBackend() {
  if (hasKV) return 'kv';
  if (hasRedis) return 'redis';
  return 'none';
}
function getSecondaryBackend() {
  if (hasKV && hasRedis) return 'redis'; // if KV fails, try Redis
  return 'none';
}

// --- Low-level clients ---
async function redisCommand(cmd) {
  if (!hasRedis) throw new Error('Upstash Redis not configured');
  const resp = await fetch(R_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: cmd }),
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash Redis error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json; // { result: ... } shape
}

async function kvGetRaw(key) {
  if (!hasKV) throw new Error('Upstash KV not configured');
  const resp = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash KV get error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  // KV returns { result: "value" | null }
  return json?.result ?? null;
}

async function kvSetRaw(key, value, ttlSec) {
  if (!hasKV) throw new Error('Upstash KV not configured');
  const body = { value };
  if (ttlSec) body.expiration_ttl = ttlSec;
  const resp = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash KV set error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

async function kvDelRaw(key) {
  if (!hasKV) throw new Error('Upstash KV not configured');
  const resp = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash KV del error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json;
}

// --- Unified store with fallback ---
async function storeSet(key, value, ttlSec) {
  const asString = typeof value === 'string' ? value : JSON.stringify(value);
  const primary = getPrimaryBackend();
  const secondary = getSecondaryBackend();

  async function doKV() { return kvSetRaw(key, asString, ttlSec); }
  async function doRedis() {
    const args = ['SET', key, asString];
    if (ttlSec) args.push('EX', String(ttlSec));
    return redisCommand(args);
  }

  try {
    if (primary === 'kv') return await doKV();
    if (primary === 'redis') return await doRedis();
    throw new Error('No Upstash backend configured (KV or Redis)');
  } catch (e) {
    if (secondary !== 'none') {
      try {
        if (secondary === 'kv') return await doKV();
        if (secondary === 'redis') return await doRedis();
      } catch (e2) {
        throw new Error(`Both Upstash backends failed. Primary: ${e?.message}. Secondary: ${e2?.message}`);
      }
    }
    throw e;
  }
}

async function storeGet(key) {
  const primary = getPrimaryBackend();
  const secondary = getSecondaryBackend();

  async function doKV() { return kvGetRaw(key); }
  async function doRedis() {
    const out = await redisCommand(['GET', key]); // { result: string|null }
    return out?.result ?? null;
  }

  try {
    if (primary === 'kv') return await doKV();
    if (primary === 'redis') return await doRedis();
    throw new Error('No Upstash backend configured (KV or Redis)');
  } catch (e) {
    if (secondary !== 'none') {
      try {
        if (secondary === 'kv') return await doKV();
        if (secondary === 'redis') return await doRedis();
      } catch (e2) {
        throw new Error(`Both Upstash backends failed. Primary: ${e?.message}. Secondary: ${e2?.message}`);
      }
    }
    throw e;
  }
}

async function storeDel(key) {
  const primary = getPrimaryBackend();
  const secondary = getSecondaryBackend();

  async function doKV() { return kvDelRaw(key); }
  async function doRedis() { return redisCommand(['DEL', key]); }

  try {
    if (primary === 'kv') return await doKV();
    if (primary === 'redis') return await doRedis();
    throw new Error('No Upstash backend configured (KV or Redis)');
  } catch (e) {
    if (secondary !== 'none') {
      try {
        if (secondary === 'kv') return await doKV();
        if (secondary === 'redis') return await doRedis();
      } catch (e2) {
        throw new Error(`Both Upstash backends failed. Primary: ${e?.message}. Secondary: ${e2?.message}`);
      }
    }
    throw e;
  }
}

// --- Keys & cookie helpers ---
const GA_KEY    = (sid) => `aa:ga4:${sid}`;
const PKCE_KEY  = (sid) => `aa:pkce:${sid}`;
const STATE_KEY = (sid, nonce) => `aa:state:${sid}:${nonce}`;

export function readSidFromCookie(req) {
  const enc = getCookie(req, SESSION_COOKIE_NAME);
  if (!enc) return null;
  try { return decryptSID(enc); } catch { return null; }
}

// Token record management
export async function getTokenRecordBySid(sid) {
  const raw = await storeGet(GA_KEY(sid));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}
export async function setTokenRecordBySid(sid, rec) {
  const ttl = 60 * 60 * 24 * 30; // 30 days
  return storeSet(GA_KEY(sid), rec, ttl);
}
export async function deleteTokenRecordBySid(sid) {
  return storeDel(GA_KEY(sid));
}

// PKCE + state helpers
export async function savePkceVerifier(sid, code_verifier) {
  return storeSet(PKCE_KEY(sid), code_verifier, 600); // 10 mins
}
export async function popPkceVerifier(sid) {
  const v = await storeGet(PKCE_KEY(sid));
  if (v) await storeDel(PKCE_KEY(sid));
  return typeof v === 'string' ? v : null;
}
export async function saveState(sid, nonce) {
  return storeSet(STATE_KEY(sid, nonce), '1', 600); // 10 mins
}
export async function verifyAndDeleteState(sid, nonce) {
  const v = await storeGet(STATE_KEY(sid, nonce));
  if (!v) return false;
  await storeDel(STATE_KEY(sid, nonce));
  return true;
}

// --- Token refresh ---
function nowSec() { return Math.floor(Date.now() / 1000); }

export async function ensureValidAccessToken(rec) {
  if (!rec) return null;
  if (rec.expiry && rec.expiry - 60 > nowSec()) return rec;
  if (!rec.refresh_token) return null;

  const params = new URLSearchParams();
  params.set('client_id', process.env.GOOGLE_CLIENT_ID);
  params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET);
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', rec.refresh_token);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!resp.ok) {
    console.error('Refresh token failed', await resp.text());
    return null;
  }
  const json = await resp.json();
  const expires_in = json.expires_in || 3600;
  return {
    access_token: json.access_token,
    refresh_token: rec.refresh_token,
    expiry: nowSec() + expires_in,
    created_at: nowSec(),
  };
}

export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return { sid: null, token: null };

  const rec = await getTokenRecordBySid(sid);
  if (!rec) return { sid, token: null };

  const valid = await ensureValidAccessToken(rec);
  if (!valid) return { sid, token: null };

  if (valid.access_token !== rec.access_token || valid.expiry !== rec.expiry) {
    await setTokenRecordBySid(sid, valid);
  }
  return { sid, token: valid.access_token };
}
