// web/pages/api/auth/google/start.js
import { ensureSid } from "../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { redirect = "/" } = req.query || {};
    const sid = ensureSid(req, res);

    const state = Buffer.from(
      JSON.stringify({ sid, redirect })
    ).toString("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
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
    res.status(200).json({ ok: true, url });
  } catch (e) {
    res.status(200).json({ ok: false, error: "OAuth start failed", message: e.message || String(e) });
  }
}
