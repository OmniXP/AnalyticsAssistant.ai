// web/pages/api/dev/check-ga-cookie.js
// Dumps the aa_sid / aa_auth cookies for quick inspection.

import { getCookie } from "../../../lib/server/cookies";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const aa_sid = getCookie(req, "aa_sid");
    const aa_auth = getCookie(req, "aa_auth");
    res.status(200).json({
      ok: true,
      cookies: {
        aa_sid: aa_sid ? "(present)" : null,
        aa_auth: aa_auth ? "(present - legacy)" : null,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
