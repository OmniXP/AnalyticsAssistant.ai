// web/pages/api/auth/google/disconnect.js
export const runtime = "nodejs";

import { readSidFromCookie, clearGoogleTokens, SESSION_COOKIE_NAME } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (sid) await clearGoogleTokens(sid);
    
    // Clear the cookie using the correct cookie name
    const isSecure = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    const secureFlag = isSecure ? "Secure; " : "";
    res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; ${secureFlag}HttpOnly`);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
