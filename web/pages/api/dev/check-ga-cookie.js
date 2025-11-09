// web/pages/api/dev/check-ga-cookie.js
// Quick read of cookies to confirm SID and legacy aa_auth visibility.

import { getCookie } from "../../../lib/server/cookies";
import { readSidFromCookie, SESSION_COOKIE_NAME } from "../../../lib/server/ga4-session";

export default function handler(req, res) {
  const aa_sid_cookie = getCookie(req, SESSION_COOKIE_NAME);
  const aa_auth_cookie = getCookie(req, "aa_auth"); // legacy
  const sid = readSidFromCookie(req);

  res.status(200).json({
    ok: true,
    cookies: {
      [SESSION_COOKIE_NAME]: !!aa_sid_cookie,
      aa_auth: !!aa_auth_cookie,
    },
    sidDerived: sid || null,
    raw: {
      [SESSION_COOKIE_NAME]: aa_sid_cookie || null,
      aa_auth: aa_auth_cookie || null,
    },
  });
}
