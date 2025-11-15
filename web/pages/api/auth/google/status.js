// web/pages/api/auth/google/status.js
import { statusForRequest } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const s = await statusForRequest(req);
    res.status(200).json({ ok: true, ...s });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
