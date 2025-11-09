// web/pages/api/auth/google/status.js
import { getSessionTokens } from "../../../lib/server/ga4-session.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const t = getSessionTokens(req);
    if (!t?.access_token) {
      return res.status(200).json({ connected: false });
    }
    res.status(200).json({ connected: true, expires_at: t.expires_at || null });
  } catch (e) {
    res.status(200).json({ connected: false });
  }
}
