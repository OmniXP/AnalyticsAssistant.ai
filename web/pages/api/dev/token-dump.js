// web/pages/api/dev/token-dump.js
import { readSidFromCookie, getGoogleTokens, isExpired, getUpstashConfig } from "../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  const sid = readSidFromCookie(req);
  const cfg = getUpstashConfig();
  let tokens = null;
  let expired = null;

  if (sid) {
    tokens = await getGoogleTokens(sid);
    expired = tokens ? isExpired(tokens) : null;
  }

  // Never leak real tokens
  const redacted = tokens
    ? {
        has_access_token: Boolean(tokens.access_token),
        has_refresh_token: Boolean(tokens.refresh_token),
        scope: tokens.scope || null,
        expiry_date: tokens.expiry_date || null,
        expires_at: tokens.expires_at || null,
        saved_at: tokens.saved_at || null,
      }
    : null;

  res.json({
    ok: true,
    sid: sid || null,
    upstash_config_present: Boolean(cfg),
    tokens: redacted,
    expired,
  });
}
