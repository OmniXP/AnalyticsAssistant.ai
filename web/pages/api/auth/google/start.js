// web/pages/api/auth/google/start.js
import { ensureSid } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  // Always create/ensure a session id
  const sid = ensureSid(req, res);

  // Optional: where to send the user back after OAuth
  const desiredRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";

  const state = Buffer.from(
    JSON.stringify({ sid, redirect: desiredRedirect })
  ).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "https://app.analyticsassistant.ai/api/auth/google/callback",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/analytics.readonly",
    ].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // If this looks like a browser navigation (no JSON requested), 302 redirect immediately.
  const wantsJson =
    req.headers["accept"]?.includes("application/json") ||
    req.query.json === "1" ||
    req.method === "POST";

  if (!wantsJson) {
    res.statusCode = 302;
    res.setHeader("Location", url);
    return res.end();
  }

  // Otherwise, return JSON for XHR-driven flows
  res.status(200).json({ ok: true, url });
}
