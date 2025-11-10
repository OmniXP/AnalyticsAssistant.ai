// web/pages/api/auth/google/disconnect.js
import { readSidFromCookie, clearGaTokens } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (!sid) {
      return res.status(401).json({ ok: false, error: "No session" });
    }
    await clearGaTokens(sid);
    res.status(200).json({ ok: true, disconnected: true, sid });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
