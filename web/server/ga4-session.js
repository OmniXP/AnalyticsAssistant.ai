// web/lib/cookies.js
export function serializeCookie(name, value, options = {}) {
  const opt = { path: "/", ...options };
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (opt.maxAge != null) str += `; Max-Age=${Math.floor(opt.maxAge / 1000)}`;
  if (opt.domain) str += `; Domain=${opt.domain}`;
  if (opt.path) str += `; Path=${opt.path}`;
  if (opt.expires) str += `; Expires=${opt.expires.toUTCString()}`;
  if (opt.httpOnly) str += `; HttpOnly`;
  if (opt.secure) str += `; Secure`;
  if (opt.sameSite) str += `; SameSite=${opt.sameSite}`;

  return str;
}
