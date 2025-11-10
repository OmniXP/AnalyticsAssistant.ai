// web/pages/api/auth/google/status.js
import { readSidFromCookie, getGoogleTokens, isExpired } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  const sid = readSidFromCookie(req);
  if (!sid) {
    res.json({ ok: true, hasTokens: false, reason: "NO_SESSION" });
    return;
  }
  const tokens = await getGoogleTokens(sid);
  if (!tokens) {
    res.json({ ok: true, hasTokens: false, reason: "NO_TOKENS" });
    return;
  }
  res.json({ ok: true, hasTokens: !isExpired(tokens), expired: isExpired(tokens) });
}
