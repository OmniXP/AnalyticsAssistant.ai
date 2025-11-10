// web/pages/api/auth/google/start.js
import { ensureSid } from "../../../../lib/server/ga4-session.js";

const GOOGLE_AUTHORISE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_REDIRECT = "/";

export default async function handler(req, res) {
  try {
    const sid = ensureSid(req, res);
    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : DEFAULT_REDIRECT;

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/analytics.readonly",
      ].join(" "),
      state: JSON.stringify({ sid, redirect }),
    });

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
      res.status(500).json({ error: "OAuth start failed", message: "Google env not configured" });
      return;
    }

    res.writeHead(302, { Location: `${GOOGLE_AUTHORISE_URL}?${params.toString()}` });
    res.end();
  } catch (e) {
    res.status(500).json({ error: "OAuth start failed", message: e.message });
  }
}
