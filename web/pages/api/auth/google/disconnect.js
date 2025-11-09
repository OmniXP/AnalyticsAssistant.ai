// web/pages/api/auth/google/disconnect.js
import { getSessionTokens, clearSessionTokens } from "../../../lib/server/ga4-session.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const tokens = getSessionTokens(req);
    // Best-effort revoke
    if (tokens?.access_token) {
      try {
        const params = new URLSearchParams();
        params.set("token", tokens.access_token);
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
      } catch {}
    }
    clearSessionTokens(res);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: true });
  }
}
