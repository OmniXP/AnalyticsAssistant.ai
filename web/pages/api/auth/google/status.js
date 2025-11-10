// web/pages/api/auth/google/status.js
import { readSidFromCookie, getGoogleTokens, isExpired } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(200).json({ ok: true, hasTokens: false });

    const tokens = await getGoogleTokens(sid);
    const expired = tokens ? isExpired(tokens) : true;

    res.status(200).json({ ok: true, hasTokens: Boolean(tokens), expired });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
