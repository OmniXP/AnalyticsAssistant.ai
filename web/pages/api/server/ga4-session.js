// web/pages/api/server/ga4-session.js
// Session + Upstash KV helpers for GA4 tokens

import { getCookie, setCookie, SESSION_COOKIE_NAME } from './cookies';

const KV_URL = process.env.UPSTASH_KV_REST_URL;
const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN;

function kvHeaders() {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  return { Authorization: `Bearer ${KV_TOKEN}` };
}

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, { headers: kvHeaders(), cache: 'no-store' });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`KV get ${r.status}: ${t}`);
  return j?.result ?? null;
}

async function kvSet(key, value, ttlSec) {
  const qs = ttlSec ? `?expiration_ttl=${encodeURIComponent(ttlSec)}` : '';
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}${qs}`, {
    method: 'POST',
    headers: { ...kvHeaders(), 'Content-Type': 'text/plain' },
    body,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`KV set ${r.status}: ${t}`);
  return true;
}

async function kvDel(key) {
  const r = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, { method: 'POST', headers: kvHeaders() });
  const t = await r.text();
  if (!r.ok) throw new Error(`KV del ${r.status}: ${t}`);
  return true;
}

// Public API

export function readSidFromCookie(req) {
  return getCookie(req, SESSION_COOKIE_NAME) || '';
}

export function writeSidCookie(res, sid) {
  // 90 days
  setCookie(res, SESSION_COOKIE_NAME, sid, { maxAge: 60 * 60 * 24 * 90 });
}

export async function savePkceVerifier(sid, verifier) {
  if (!sid) throw new Error('Missing sid');
  return kvSet(`pkce:${sid}`, verifier, 600);
}

export async function loadPkceVerifier(sid) {
  if (!sid) return null;
  return kvGet(`pkce:${sid}`);
}

export async function deletePkceVerifier(sid) {
  if (!sid) return;
  try { await kvDel(`pkce:${sid}`); } catch {}
}

export async function saveTokensForSid(sid, tokens) {
  if (!sid) throw new Error('Missing sid');
  // 30 days by default
  return kvSet(`tokens:${sid}`, typeof tokens === 'string' ? tokens : JSON.stringify(tokens), 60 * 60 * 24 * 30);
}

export async function getTokensForSid(sid) {
  if (!sid) return null;
  const raw = await kvGet(`tokens:${sid}`);
  if (!raw) return null;
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}

export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return { token: null };
  const tokens = await getTokensForSid(sid);
  const token = tokens?.access_token || null;
  return { token, tokens, sid };
}
