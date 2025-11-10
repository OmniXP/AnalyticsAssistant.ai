// web/pages/api/dev/check-ga-cookie.js
import { readSidFromCookie, SESSION_COOKIE_NAME } from "../../../lib/server/ga4-session.js";

export default function handler(req, res) {
  const sid = readSidFromCookie(req);
  res.status(200).json({
    ok: true,
    sessionCookieName: SESSION_COOKIE_NAME,
    hasSessionCookie: Boolean(sid),
    sid: sid || null,
    rawCookieHeader: req.headers?.cookie || null,
  });
}
