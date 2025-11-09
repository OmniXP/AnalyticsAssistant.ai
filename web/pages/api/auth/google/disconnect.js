// web/pages/api/auth/google/disconnect.js
// Clears local session cookie and any stored GA tokens for this SID.

import { clearCookie } from "../../../../lib/server/cookies";
import { readSidFromCookie, clearGaTokens, SESSION_COOKIE_NAME } from "../../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (sid) {
      try { await clearGaTokens(sid); } catch {}
    }
    clearCookie(res, SESSION_COOKIE_NAME);
    res.status(200).json({ ok: true, cleared: !!sid });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
