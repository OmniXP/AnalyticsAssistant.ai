// web/pages/api/auth/google/start.js
import { buildGoogleAuthUrl, putAuthState } from "../_core/google-oauth";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    // Always prefer server-side configured redirect. Ignore client-provided redirects to /dev/*.
    const desired = process.env.POST_AUTH_REDIRECT || "/";
    const state = await putAuthState({ redirect: desired });

    const url = buildGoogleAuthUrl({
      state,
      prompt: "consent",
      access_type: "offline",
      include_granted_scopes: "true",
    });

    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    res.status(500).json({ error: "OAuth start failed", message: String(e?.message || e) });
  }
}
