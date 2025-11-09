// web/pages/api/auth/google/disconnect.js
// Clears GA4 auth/session cookies to "disconnect" the user.

import { clearCookie } from "../../../../lib/server/cookies";

export const config = { runtime: "nodejs" };

// Keep names in sync with your session implementation
const SID_COOKIE = "aa_sid";
const LEGACY_COOKIE = "aa_auth";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    // Clear both the current SID cookie and the legacy aa_auth if present
    clearCookie(res, SID_COOKIE);
    clearCookie(res, LEGACY_COOKIE);

    // Optionally, you can also return a redirect URL to your app home
    return res.status(200).json({ ok: true, disconnected: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
