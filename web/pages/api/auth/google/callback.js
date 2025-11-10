// web/pages/api/auth/google/callback.js
import { saveGoogleTokens } from "../../../../lib/server/ga4-session.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error_description || json?.error || `Token exchange failed (${res.status})`;
    const e = new Error(msg);
    e.debug = json;
    throw e;
  }
  return json;
}

export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(state);
    } catch {
      res.status(400).send("Invalid state");
      return;
    }
    const sid = parsed?.sid;
    const redirect = parsed?.redirect || "/";

    const tokens = await exchangeCodeForTokens(code);
    await saveGoogleTokens(sid, tokens);

    res.writeHead(302, { Location: redirect });
    res.end();
  } catch (e) {
    res.status(500).send(`Callback error: ${e.message}`);
  }
}
