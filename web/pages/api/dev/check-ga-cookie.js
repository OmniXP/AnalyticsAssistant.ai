// web/pages/api/dev/check-ga-cookie.js
import {
  readSidFromCookie,
  SESSION_COOKIE_NAME,
} from "../../../lib/server/ga4-session.js";

/**
 * Dev helper: echoes whether the GA session cookie is present and what SID we read.
 */
export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    const cookiesHeader = req.headers?.cookie || "";
    const hasSessionCookie = cookiesHeader.includes(`${SESSION_COOKIE_NAME}=`);

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      ok: true,
      sessionCookieName: SESSION_COOKIE_NAME,
      hasSessionCookie,
      sid: sid || null,
      rawCookieHeader: cookiesHeader || null,
    });
  } catch (err) {
    console.error("check-ga-cookie error:", err);
    res.status(500).json({ ok: false, error: "check_failed" });
  }
}
