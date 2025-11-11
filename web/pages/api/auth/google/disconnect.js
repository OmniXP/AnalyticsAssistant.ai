// web/pages/api/auth/google/disconnect.js
import { clearGaTokens } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    await clearGaTokens(req, res);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: true });
  }
}
