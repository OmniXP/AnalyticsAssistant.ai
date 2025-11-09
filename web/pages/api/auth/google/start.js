// web/pages/api/auth/google/start.js
// Starts Google OAuth for GA4 read-only access. Ensures a SID cookie exists.

import { setCookie, getCookie } from "../../../../lib/server/cookies";
import { readSidFromCookie, SESSION_COOKIE_NAME } from "../../../../lib/server/ga4-session";

function makeSid() {
  // RFC4122-ish simple SID
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

export default async function handler(req, res) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!baseUrl || !clientId || !clientSecret) {
      return res.status(500).json({ error: "OAuth start failed", message: "Google or base URL env missing" });
    }

    // Ensure we have a SID cookie
    let sid = readSidFromCookie(req);
    if (!sid) {
      sid = makeSid();
      setCookie(res, SESSION_COOKIE_NAME, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    // Where to come back after OAuth
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Optional app redirect after success
    const desired = req.query.redirect || process.env.POST_AUTH_REDIRECT || "/";

    const state = Buffer.from(JSON.stringify({ sid, redirect: desired })).toString("base64url");

    const scope = [
      "openid",
      "email",
      "https://www.googleapis.com/auth/analytics.readonly",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope,
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    // For XHR callers, return JSON; for normal navigation, redirect.
    if ((req.headers.accept || "").includes("application/json")) {
      return res.status(200).json({ ok: true, url: authUrl });
    }
    res.writeHead(302, { Location: authUrl });
    res.end();
  } catch (e) {
    res.status(500).json({ error: "OAuth start failed", message: String(e?.message || e) });
  }
}
