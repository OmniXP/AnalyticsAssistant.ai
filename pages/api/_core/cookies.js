// pages/api/_core/cookies.js
// AES-256-GCM encrypted SID cookie helpers (host-only cookie by default)

import crypto from 'crypto';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'aa_auth';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined; // host-only by default
const AES_ALGO = 'aes-256-gcm';

function getKey() {
  const secret = process.env.APP_ENC_KEY;
  if (!secret) throw new Error('APP_ENC_KEY not set');
  return crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('aa_salt'),
    Buffer.from('aa_cookie_key'),
    32
  );
}

export function encryptSID(plainSid) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(AES_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainSid, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptSID(token) {
  const key = getKey();
  const buf = Buffer.from(token, 'base64url');
  if (buf.length < 12 + 16 + 1) throw new Error('Invalid token');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv(AES_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

export function getCookie(req, name = COOKIE_NAME) {
  const raw = req.headers?.cookie || '';
  const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const [k, ...rest] = p.split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function serializeCookie(name, value, {
  httpOnly = true,
  secure = true,
  path = '/',
  sameSite = 'Lax',
  domain = COOKIE_DOMAIN,
  maxAge
} = {}) {
  const segs = [`${name}=${encodeURIComponent(value)}`];
  if (domain) segs.push(`Domain=${domain}`);
  if (path) segs.push(`Path=${path}`);
  if (secure) segs.push('Secure');
  if (httpOnly) segs.push('HttpOnly');
  if (sameSite) segs.push(`SameSite=${sameSite}`);
  if (typeof maxAge === 'number') segs.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return segs.join('; ');
}

export function setCookie(res, name, value, opts) {
  const header = serializeCookie(name, value, opts);
  const prev = res.getHeader('Set-Cookie');
  if (!prev) res.setHeader('Set-Cookie', header);
  else if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, header]);
  else res.setHeader('Set-Cookie', [prev, header]);
}

export function deleteCookie(res, name = COOKIE_NAME) {
  setCookie(res, name, '', { maxAge: 0 });
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
