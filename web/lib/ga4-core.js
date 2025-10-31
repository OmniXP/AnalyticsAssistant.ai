// web/lib/ga4-core.js
const crypto = require('crypto');
const { URLSearchParams } = require('url');
const { Redis } = require('@upstash/redis');

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const ADMIN_API_SUMMARIES = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

const APP_ENC_KEY = process.env.APP_ENC_KEY || 'change_me_please_change_me_please_';
const REDIRECT_URI = process.env.GA_OAUTH_REDIRECT;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'aa_auth';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const b64url = (buf) => buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sha256 = (input) => crypto.createHash('sha256').update(input).digest();
const nowSec = () => Math.floor(Date.now() / 1000);
const randomId = (len = 32) => b64url(crypto.randomBytes(len));

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(APP_ENC_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return b64url(Buffer.concat([iv, tag, enc]));
}
function decrypt(payload) {
  const raw = Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'), 'base64');
  const iv = raw.subarray(0,12);
  const tag = raw.subarray(12,28);
  const data = raw.subarray(28);
  const key = crypto.createHash('sha256').update(APP_ENC_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

// In-memory PKCE (state -> { verifier })
const pkceStore = new Map();

// Redis helpers
async function kvGet(sessionId) {
  const rec = await redis.hgetall(`aa:ga4:${sessionId}`);
  return rec && Object.keys(rec).length ? rec : null;
}
async function kvSet(sessionId, data) { await redis.hset(`aa:ga4:${sessionId}`, data); }
async function kvDel(sessionId) { await redis.del(`aa:ga4:${sessionId}`); }

async function exchangeCodeForTokens({ code, code_verifier }) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    code, code_verifier, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI,
  });
  const res = await fetch(GOOGLE_TOKEN, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return await res.json();
}
async function refreshAccessToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token, grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return await res.json();
}

async function ensureAccessToken(sessionId) {
  const rec = await kvGet(sessionId);
  if (!rec) return null;
  const now = nowSec();
  const expiry = rec.expiry ? parseInt(rec.expiry, 10) : 0;
  if (rec.access_token && expiry && expiry > now + 60) return rec.access_token;
  if (!rec.refresh_token) return null;
  const refreshed = await refreshAccessToken(rec.refresh_token);
  const updated = {
    refresh_token: rec.refresh_token,
    access_token: refreshed.access_token,
    expiry: String(now + (refreshed.expires_in || 3600)),
    created_at: rec.created_at || String(Date.now()),
  };
  await kvSet(sessionId, updated);
  return updated.access_token;
}

function getSessionIdFromReq(req) {
  const raw = req.cookies?.[SESSION_COOKIE_NAME];
  if (!raw) return null;
  try { const { sid } = JSON.parse(decrypt(raw)); return sid || null; } catch { return null; }
}
function setSessionCookie(res, sid) {
  const enc = encrypt(JSON.stringify({ sid, ts: Date.now() }));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${enc}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
}

// Handlers for Next.js Pages API
function oauthStart(req, res) {
  const state = randomId(24);
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(sha256(verifier));
  pkceStore.set(state, { verifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256',
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
  });
  res.redirect(302, `${GOOGLE_AUTH}?${params.toString()}`);
}
async function oauthCallback(req, res) {
  const { code, state, error } = req.query || {};
  if (error) return res.status(400).send(`OAuth error: ${error}`);
  const rec = pkceStore.get(state);
  if (!rec) return res.status(400).send('Invalid or expired state');
  pkceStore.delete(state);

  const tokens = await exchangeCodeForTokens({ code, code_verifier: rec.verifier });
  const sid = randomId(24);
  await kvSet(sid, {
    refresh_token: tokens.refresh_token || '',
    access_token: tokens.access_token,
    expiry: String(nowSec() + (tokens.expires_in || 3600)),
    created_at: String(Date.now()),
  });
  setSessionCookie(res, sid);
  res.redirect(302, '/?connected=ga4');
}
async function status(req, res) {
  const sid = getSessionIdFromReq(req);
  if (!sid) return res.json({ connected: false });
  try { const at = await ensureAccessToken(sid); res.json({ connected: !!at }); }
  catch { res.json({ connected: false }); }
}
async function disconnect(req, res) {
  const sid = getSessionIdFromReq(req);
  if (sid) await kvDel(sid);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`);
  res.json({ ok: true });
}
async function listProperties(req, res) {
  const sid = getSessionIdFromReq(req);
  if (!sid) return res.status(401).json({ error: 'Not authenticated' });
  const accessToken = await ensureAccessToken(sid);
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' });

  const r = await fetch(ADMIN_API_SUMMARIES, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    const text = await r.text();
    return res.status(r.status).json({ error: 'Failed to fetch account summaries', details: text });
  }
  const data = await r.json();
  const properties = [];
  for (const acc of data.accountSummaries || []) {
    for (const p of acc.propertySummaries || []) {
      properties.push({
        accountDisplayName: acc.displayName,
        propertyDisplayName: p.displayName,
        property: p.property, // "properties/123456789"
        selected: false,
      });
    }
  }
  res.json({ properties });
}

module.exports = { oauthStart, oauthCallback, status, disconnect, listProperties };
