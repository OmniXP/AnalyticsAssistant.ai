// web/pages/api/auth/google/start.js
import { ensureSid } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  // Make sure we have a session id cookie before leaving for Google
  const sid = ensureSid(req, res);

  // Build the redirect_uri that Google will call back
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  const redirectUri = `${origin}/api/auth/google/callback`;

  // Optional redirect back into the app after OAuth
  const desiredRedirect =
    typeof req.query?.redirect === "string" ? req.query.redirect : "/";

  // Encode minimal state we need
  const state = Buffer.from(
    JSON.stringify({ sid, redirect: desiredRedirect }),
    "utf8"
  ).toString("base64url");

  // Compose Google OAuth URL
  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", process.env.GOOGLE_CLIENT_ID);
  params.set("redirect_uri", redirectUri);
  params.set(
    "scope",
    [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/analytics.readonly",
    ].join(" ")
  );
  params.set("access_type", "offline");
  params.set("include_granted_scopes", "true");
  params.set("prompt", "consent");
  params.set("state", state);

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // **Redirect** immediately so the flow works even if this endpoint is opened directly
  res.writeHead(302, { Location: url });
  res.end();
}
