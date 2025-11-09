// web/pages/api/server/cookies.js
// Minimal cookie helpers for API routes.

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'aa_sid';

// Reads a cookie from the request headers
export function getCookie(req, name) {
  try {
    const raw = req.headers?.cookie || '';
    const parts = raw.split(/;\s*/).map(s => s.trim());
    for (const p of parts) {
      const [k, ...rest] = p.split('=');
      if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
  } catch {
    return '';
  }
}

// Sets a cookie on the response
export function setCookie(res, name, value, opts = {}) {
  const {
    httpOnly = true,
    sameSite = 'Lax',
    path = '/',
    secure = process.env.NODE_ENV === 'production',
    maxAge, // seconds
  } = opts;

  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  if (typeof maxAge === 'number') cookie += `; Max-Age=${Math.max(0, Math.floor(maxAge))}`;

  const prev = res.getHeader('Set-Cookie');
  if (!prev) res.setHeader('Set-Cookie', cookie);
  else if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, cookie]);
  else res.setHeader('Set-Cookie', [prev, cookie]);
}
