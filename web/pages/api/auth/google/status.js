// web/pages/api/auth/google/status.js
import { getGoogleTokens, isExpired } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const tokens = await getGoogleTokens(req);
    const hasTokens = !!tokens;
    const expired = isExpired(tokens);
    const connected = hasTokens && !expired;
    res.status(200).json({ ok: true, hasTokens, expired, connected });
  } catch (e) {
    res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false });
  }
}
