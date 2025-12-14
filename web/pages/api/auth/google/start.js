// web/pages/api/auth/google/start.js
import { buildGoogleAuthUrl } from "../../../../server/google-oauth.js";

export default async function handler(req, res) {
  try {
    const desiredRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
    const format = req.query.format || "redirect"; // "redirect" or "json"
    
    // Build Google OAuth URL with PKCE (stores state + verifier in Upstash)
    const { url } = await buildGoogleAuthUrl(req, { desiredRedirect });
    
    // Return JSON if requested (for client-side redirect), otherwise redirect directly
    if (format === "json") {
      return res.status(200).json({ url });
    }
    
    // Default: Redirect directly to Google's OAuth page
    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    console.error("OAuth start error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
