// web/pages/api/auth/google/callback.js
import { saveGoogleTokens } from "../../../../lib/server/ga4-session.js";

function parseState(s) {
  try {
    const json = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (json && typeof json === "object") return json;
  } catch (_) {}
  return {};
}

export default async function handler(req, res) {
  try {
    const { code, state: stateParam, error } = req.query || {};
    if (error) {
      return res.status(400).send(`OAuth error: ${error}`);
    }
    if (!code) {
      return res.status(400).send("Missing OAuth code");
    }

    const { sid, redirect } = parseState(String(stateParam || ""));
    if (!sid) {
      return res.status(400).send("Missing session id in state");
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      code: String(code),
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || "https://app.analyticsassistant.ai/api/auth/google/callback",
      grant_type: "authorization_code",
    });

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return res.status(400).send(`Token exchange failed: ${resp.status} ${t}`);
    }

    const tokens = await resp.json();
    // Persist; helper normalises expiry and preserves refresh_token if needed
    await saveGoogleTokens(sid, tokens);

    // Set a tiny "connected" cookie for UI if you want (optional):
    res.setHeader("Set-Cookie", [
      `aa_auth=1; Path=/; HttpOnly; SameSite=Lax; ${
        process.env.NODE_ENV === "production" ? "Secure" : ""
      }`,
    ]);

    const backTo = typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/";
    res.statusCode = 302;
    res.setHeader("Location", backTo);
    return res.end();
  } catch (e) {
    return res.status(500).send(`Callback error: ${e.message || String(e)}`);
  }
}
