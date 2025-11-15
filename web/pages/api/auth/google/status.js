// web/pages/api/auth/google/status.js
export const runtime = "nodejs";

import { readSidFromCookie, getGoogleTokens, isExpired } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false });

    const toks = await getGoogleTokens(sid);
    if (!toks) return res.status(200).json({ ok: true, hasTokens: false, expired: true, connected: false });

    const expired = isExpired(toks);
    return res.status(200).json({
      ok: true,
      hasTokens: true,
      expired,
      connected: !expired,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
