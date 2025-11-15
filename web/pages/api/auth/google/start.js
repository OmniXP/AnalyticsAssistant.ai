// web/pages/api/auth/google/start.js
import { buildGoogleAuthUrl } from "../../../../server/google-oauth.js";

export default async function handler(req, res) {
  try {
    const desiredRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
    
    // Build Google OAuth URL with PKCE (stores state + verifier in Upstash)
    const { url } = await buildGoogleAuthUrl(req, { desiredRedirect });
    
    // Redirect directly to Google's OAuth page
    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    console.error("OAuth start error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
