// web/pages/api/auth/google/start.js
import { ensureSid } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const root = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;
    const redirectUri = `${root}/api/auth/google/callback`;

    if (!clientId) {
      return res.status(500).json({ error: "OAuth start failed", message: "Missing GOOGLE_CLIENT_ID" });
    }

    const sid = ensureSid(req, res);

    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
    const state = encodeURIComponent(JSON.stringify({ sid, redirect }));

    const scope = [
      "https://www.googleapis.com/auth/analytics.readonly",
      // add other scopes if you truly need them
    ].join(" ");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "consent"); // ensure refresh_token on first grant

    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
  } catch (err) {
    console.error("OAuth start error:", err);
    res.status(500).json({ error: "OAuth start failed", message: err.message || "unknown_error" });
  }
}
