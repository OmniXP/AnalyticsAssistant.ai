// web/pages/api/auth/google/status.js
import { getFreshTokens, isExpired } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    // Try to auto-refresh, then report truthful status
    const t = await getFreshTokens(req, res);
    const hasTokens = !!t;
    const expired = isExpired(t);
    const connected = hasTokens && !expired;
    res.status(200).json({ ok: true, hasTokens, expired, connected });
  } catch {
    res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false });
  }
}
