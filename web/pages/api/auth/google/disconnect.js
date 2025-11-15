// web/pages/api/auth/google/disconnect.js
export const runtime = "nodejs";

import { readSidFromCookie, clearGaTokens } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (sid) await clearGaTokens(sid);
    res.setHeader("Set-Cookie", `aa_auth=; Path=/; Max-Age=0; SameSite=Lax; Secure`);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
