// web/pages/api/dev/check-ga-cookie.js
const { readSessionIdFromRequest } = require("../../../server/ga4-session");

export default async function handler(req, res) {
  try {
    const sid = readSessionIdFromRequest(req);
    res.status(200).json({
      sessionCookieName: process.env.SESSION_COOKIE_NAME || "aa_auth",
      sidFound: !!sid,
      sid: sid || null,
    });
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
}
