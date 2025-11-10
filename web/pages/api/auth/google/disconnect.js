// web/pages/api/auth/google/disconnect.js
import {
  readSidFromCookie,
  clearGaTokens,
  SESSION_COOKIE_NAME,
} from "../../../../lib/server/ga4-session.js";

/**
 * Clears GA tokens for the current session in KV and returns a simple JSON.
 * Safe to call even if there are no tokens.
 */
export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (sid) {
      await clearGaTokens(sid);
      // leave the SID cookie intact; it identifies the browser session
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      ok: true,
      cleared: Boolean(sid),
      sessionCookie: SESSION_COOKIE_NAME,
    });
  } catch (err) {
    console.error("disconnect error:", err);
    res.status(500).json({ ok: false, error: "disconnect_failed" });
  }
}
