// web/pages/api/dev/token-dump.js
import { readSidFromCookie, getGoogleTokens } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(401).json({ ok: false, error: "No session" });

    const tokens = await getGoogleTokens(sid);
    res.status(200).json({ ok: true, sid, tokens: tokens || null });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
