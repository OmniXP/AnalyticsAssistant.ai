// pages/api/_core/ga4-session.js
// SID cookie -> Upstash token record -> auto-refresh -> bearer for Google APIs

import { getCookie, SESSION_COOKIE_NAME, decryptSID } from './cookies';

const R_URL = process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function redisCommand(cmd) {
  const res = await fetch(R_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: cmd }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash Redis error: ${res.status}`);
  return res.json();
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash KV get error: ${res.status}`);
  return (await res.json()).result;
}

async function kvSet(key, value, ttlSec) {
  const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, expiration_ttl: ttlSec }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash KV set error: ${res.status}`);
  return res.json();
}

async function kvDel(key) {
  const res = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Upstash KV del error: ${res.status}`);
  return res.json();
}

const hasRedis = !!(R_URL && R_TOKEN);
const hasKV = !!(KV_URL && KV_TOKEN);

async function storeSet(key, value, ttlSec) {
  if (hasRedis) {
    const args = ['SET', key, typeof value === 'string' ? value : JSON.stringify(value)];
    if (ttlSec) args.push('EX', String(ttlSec));
    return redisCommand(args);
  }
  if (hasKV) return kvSet(key, value, ttlSec);
  throw new Error('No Upstash configured');
}
async function storeGet(key) {
  if (hasRedis) {
    const { result } = await redisCommand(['GET', key]);
    return result;
  }
  if (hasKV) return kvGet(key);
  throw new Error('No Upstash configured');
}
async function storeDel(key) {
  if (hasRedis) return redisCommand(['DEL', key]);
  if (hasKV) return kvDel(key);
  throw new Error('No Upstash configured');
}

const GA_KEY = (sid) => `aa:ga4:${sid}`;
const PKCE_KEY = (sid) => `aa:pkce:${sid}`;
const STATE_KEY = (sid, nonce) => `aa:state:${sid}:${nonce}`;

export function readSidFromCookie(req) {
  const enc = getCookie(req, SESSION_COOKIE_NAME);
  if (!enc) return null;
  try { return decryptSID(enc); } catch { return null; }
}

export async function getTokenRecordBySid(sid) {
  const raw = await storeGet(GA_KEY(sid));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}
export async function setTokenRecordBySid(sid, rec) {
  const ttl = 60 * 60 * 24 * 30;
  return storeSet(GA_KEY(sid), rec, ttl);
}
export async function deleteTokenRecordBySid(sid) {
  return storeDel(GA_KEY(sid));
}

export async function savePkceVerifier(sid, code_verifier) {
  return storeSet(PKCE_KEY(sid), code_verifier, 600);
}
export async function popPkceVerifier(sid) {
  const v = await storeGet(PKCE_KEY(sid));
  if (v) await storeDel(PKCE_KEY(sid));
  return typeof v === 'string' ? v : null;
}
export async function saveState(sid, nonce) {
  return storeSet(STATE_KEY(sid, nonce), '1', 600);
}
export async function verifyAndDeleteState(sid, nonce) {
  const v = await storeGet(STATE_KEY(sid, nonce));
  if (!v) return false;
  await storeDel(STATE_KEY(sid, nonce));
  return true;
}

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
