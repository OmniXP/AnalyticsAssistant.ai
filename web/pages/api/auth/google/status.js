// web/pages/api/auth/google/status.js
export const runtime = "nodejs";

import { readSidFromCookie, getGoogleTokens, isExpired } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false });

    const tokens = await getGoogleTokens(sid);
    const hasTokens = !!(tokens && tokens.access_token);
    const expired = !tokens || isExpired(tokens);
    const connected = hasTokens && !expired;

    res.status(200).json({ ok: true, hasTokens, expired, connected });
  } catch (e) {
    res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false, error: String(e.message || e) });
  }
}
