// web/pages/api/_core/ga4-session.js
// GA4 session storage + token refresh + PKCE/state management with resilient Upstash support.
// Prefers Upstash KV (KV_REST_API_URL/TOKEN). Falls back to Redis REST (UPSTASH_REDIS_REST_URL/TOKEN).
// CommonJS exports to avoid ESM/TS tooling edge cases.

const { getCookie, SESSION_COOKIE_NAME, decryptSID } = require('./cookies');

// --- ENV detection ---
const R_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

const hasRedis = Boolean(R_URL && R_TOKEN);
const hasKV = Boolean(KV_URL && KV_TOKEN);

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

// --- Helpers ---
function errorString(prefix, status, payload) {
  const statusPart = typeof status === 'number' ? String(status) : 'unknown';
  let bodyPart = '';
  try {
    if (typeof payload === 'string') bodyPart = payload;
    else if (payload && typeof payload === 'object') bodyPart = JSON.stringify(payload);
  } catch {
    bodyPart = '[unserializable]';
  }
  return `${prefix} ${statusPart} :: ${bodyPart}`;
}

// --- Low-level clients ---
// Redis REST
async function redisCommand(cmd) {
  if (!hasRedis) throw new Error('Upstash Redis not configured');
  const resp = await fetch(R_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + R_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command: cmd }),
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(errorString('Upstash Redis error:', resp.status, json || text));
  return json; // { result: ... }
}

// Upstash KV (use documented JSON shape for set; robust normalisation on get)
async function kvGetRaw(key) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  const resp = await fetch(KV_URL + '/get/' + encodeURIComponent(key), {
    headers: { Authorization: 'Bearer ' + KV_TOKEN },
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(errorString('Upstash KV get error:', resp.status, json || text));

  // KV returns { result: "<raw string>" | null }
  let result = (json && Object.prototype.hasOwnProperty.call(json, 'result')) ? json.result : null;

  // Normalise: if someone previously stored a JSON blob as a string, extract its .value
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'value')) {
        return parsed.value;
      }
    } catch { /* not JSON string, leave as-is */ }
  }
  return result;
}

async function kvSetRaw(key, value, ttlSec) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  const bodyObj = { value: (typeof value === 'string' ? value : String(value)) };
  if (ttlSec) bodyObj.expiration_ttl = ttlSec;

  const resp = await fetch(KV_URL + '/set/' + encodeURIComponent(key), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + KV_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyObj),
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(errorString('Upstash KV set error:', resp.status, json || text));
  return json; // typically { result: "OK" }
}

async function kvDelRaw(key) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  const resp = await fetch(KV_URL + '/del/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN },
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(errorString('Upstash KV del error:', resp.status, json || text));
  return json; // typically { result: 1 }
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
        const msg = 'Both Upstash backends failed. Primary: ' + (e?.message || String(e)) +
                    '. Secondary: ' + (e2?.message || String(e2));
        throw new Error(msg);
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
    return out && Object.prototype.hasOwnProperty.call(out, 'result') ? out.result : null;
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
        const msg = 'Both Upstash backends failed. Primary: ' + (e?.message || String(e)) +
                    '. Secondary: ' + (e2?.message || String(e2));
        throw new Error(msg);
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
        const msg = 'Both Upstash backends failed. Primary: ' + (e?.message || String(e)) +
                    '. Secondary: ' + (e2?.message || String(e2));
        throw new Error(msg);
      }
    }
    throw e;
  }
}

// --- Keys & cookie helpers ---
const GA_KEY    = (sid) => 'aa:ga4:' + sid;
const PKCE_KEY  = (sid) => 'aa:pkce:' + sid;
const STATE_KEY = (sid, nonce) => 'aa:state:' + sid + ':' + nonce;

function readSidFromCookie(req) {
  const enc = getCookie(req, SESSION_COOKIE_NAME);
  if (!enc) return null;
  try { return decryptSID(enc); } catch { return null; }
}

// Token record management
async function getTokenRecordBySid(sid) {
  const raw = await storeGet(GA_KEY(sid));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}
async function setTokenRecordBySid(sid, rec) {
  const ttl = 60 * 60 * 24 * 30; // 30 days
  return storeSet(GA_KEY(sid), rec, ttl);
}
async function deleteTokenRecordBySid(sid) {
  return storeDel(GA_KEY(sid));
}

// PKCE + state helpers
async function savePkceVerifier(sid, code_verifier) {
  return storeSet(PKCE_KEY(sid), code_verifier, 600); // 10 mins
}
async function popPkceVerifier(sid) {
  const v = await storeGet(PKCE_KEY(sid));
  if (v) await storeDel(PKCE_KEY(sid));
  return typeof v === 'string' ? v : null;
}
async function saveState(sid, nonce) {
  return storeSet(STATE_KEY(sid, nonce), '1', 600); // 10 mins
}
async function verifyAndDeleteState(sid, nonce) {
  const v = await storeGet(STATE_KEY(sid, nonce));
  if (!v) return false;
  await storeDel(STATE_KEY(sid, nonce));
  return true;
}

// --- Token refresh ---
function nowSec() { return Math.floor(Date.now() / 1000); }

async function ensureValidAccessToken(rec) {
  if (!rec) return null;
  if (rec.expiry && rec.expiry - 60 > nowSec()) return rec;
  if (!rec.refresh_token) return null;

  const params = new URLSearchParams();
  params.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
  params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET || '');
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', rec.refresh_token);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!resp.ok) {
    try { console.error('Refresh token failed', resp.status, await resp.text()); }
    catch { console.error('Refresh token failed', resp.status); }
    return null;
  }
  const json = await resp.json();
  const expires_in = json && json.expires_in ? json.expires_in : 3600;
  return {
    access_token: json.access_token,
    refresh_token: rec.refresh_token,
    expiry: nowSec() + expires_in,
    created_at: nowSec(),
  };
}

async function getBearerForRequest(req) {
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

// CommonJS exports (works with `import * as session from '../_core/ga4-session'`)
module.exports = {
  readSidFromCookie,
  getTokenRecordBySid,
  setTokenRecordBySid,
  deleteTokenRecordBySid,
  savePkceVerifier,
  popPkceVerifier,
  saveState,
  verifyAndDeleteState,
  ensureValidAccessToken,
  getBearerForRequest,
};
