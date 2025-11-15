// web/pages/api/auth/google/start.js
import { ensureSid, buildGoogleAuthUrl } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
    const sid = ensureSid(res); // guarantees aa_sid exists for the whole flow
    const url = buildGoogleAuthUrl({ sid, redirect });
    res.status(200).json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
