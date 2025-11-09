// web/pages/api/auth/google/start.js
// Kicks off OAuth, ensures aa_sid, builds Google consent URL.

import { ensureSid } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const sid = ensureSid(req, res);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`}/api/auth/google/callback`;
    const scope = encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly");
    const state = encodeURIComponent(JSON.stringify({ sid, ts: Date.now() }));
    const accessType = "offline";
    const prompt = "consent";

    if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID");

    const url =
      "https://accounts.google.com/o/oauth2/v2/auth" +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&access_type=${accessType}` +
      `&prompt=${prompt}` +
      `&state=${state}`;

    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    res.status(500).json({ error: "OAuth start failed", message: String(e.message || e) });
  }
}
