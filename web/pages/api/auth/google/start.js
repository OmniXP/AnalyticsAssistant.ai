// web/pages/api/auth/google/start.js
import { getServerSession } from "next-auth/next";
import crypto from "crypto";
import { buildGoogleAuthUrl } from "../../../../server/google-oauth.js";
import { kvSetJson } from "../../../../server/ga4-session.js";
import { authOptions } from "../../../../lib/authOptions";

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    const desiredRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
    const format = req.query.format || "redirect"; // "redirect" or "json"
    
    // Build Google OAuth URL with PKCE (stores state + verifier in Upstash)
    const { url, stateId } = await buildGoogleAuthUrl(req, { desiredRedirect });

    // Persist email with state for callback (10 minute TTL) when available.
    // Some environments may not send NextAuth cookies on this request, but the
    // GA4 OAuth flow should still proceed using the session-based GA cookie.
    if (session?.user?.email) {
      try {
        await kvSetJson(`ga4:connect_state:${stateId}`, { email: session.user.email }, 600);
      } catch (e) {
        console.error("[google/start] Failed to persist connect state:", e?.message || e);
      }
    }
    
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
