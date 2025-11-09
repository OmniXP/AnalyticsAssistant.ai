// web/lib/server/cookies.js
// Small cookie helpers for API routes. Server-only.

function serializeCookie(name, value, options = {}) {
  const opts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    ...options,
  };

  const segments = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`];

  if (opts.maxAge != null) segments.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires instanceof Date) segments.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.domain) segments.push(`Domain=${opts.domain}`);
  if (opts.secure) segments.push("Secure");
  if (opts.httpOnly) segments.push("HttpOnly");
  if (opts.sameSite) segments.push(`SameSite=${opts.sameSite}`);

  return segments.join("; ");
}

export function setCookie(res, name, value, options = {}) {
  const headerValue = serializeCookie(name, value, options);
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", headerValue);
  } else if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, headerValue]);
  } else {
    res.setHeader("Set-Cookie", [prev, headerValue]);
  }
}

export function getCookie(req, name) {
  const raw = req.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const idx = p.indexOf("=");
    const k = idx >= 0 ? p.slice(0, idx) : p;
    const v = idx >= 0 ? p.slice(idx + 1) : "";
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export function clearCookie(res, name, options = {}) {
  setCookie(res, name, "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    ...options,
  });
}
