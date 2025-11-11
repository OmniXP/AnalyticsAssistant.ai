// web/pages/api/auth/google/status.js
import { getGoogleTokens, isExpired } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const tokens = await getGoogleTokens(req);
    const hasTokens = !!tokens;
    const expired = hasTokens ? isExpired(tokens) : true;
    const connected = hasTokens && !expired;
    return res.status(200).json({ ok: true, hasTokens, expired, connected });
  } catch (e) {
    return res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false, error: String(e?.message || e) });
  }
}
