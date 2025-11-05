// web/pages/api/auth/google/disconnect.js
const { readSessionIdFromRequest, kvDel } = require("../../../../server/ga4-session");
const { serializeCookie } = require("../../../../lib/cookies");

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";

export default async function handler(req, res) {
  const sid = readSessionIdFromRequest(req);
  if (sid) {
    try { await kvDel(sid); } catch {}
  }
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true, secure: true, sameSite: "Lax", maxAge: 0, path: "/",
  }));
  res.json({ ok: true });
}