// web/pages/api/auth/google/start.js
import { ensureSid } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  const sid = ensureSid(req, res);

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const desiredRedirect =
    typeof req.query?.redirect === "string" ? req.query.redirect : "/";

  const state = Buffer.from(
    JSON.stringify({ sid, redirect: desiredRedirect }),
    "utf8"
  ).toString("base64url");

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
  res.writeHead(302, { Location: url });
  res.end();
}
