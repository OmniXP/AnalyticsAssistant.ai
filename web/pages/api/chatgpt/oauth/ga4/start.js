// web/pages/api/chatgpt/oauth/ga4/start.js
// Initiate GA4 OAuth flow for ChatGPT users using connectionId + short-lived connect_code.

import crypto from "crypto";
import { buildGoogleAuthUrl } from "../../../../../lib/server/google-oauth.js";
import { getChatGPTConnectionIdFromRequest } from "../../../../../lib/server/chatgpt-auth.js";
import { kvSetJson } from "../../../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const connectionId = await getChatGPTConnectionIdFromRequest(req);
    if (!connectionId) {
      return res
        .status(401)
        .json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }

    // Generate a short-lived connect_code to link the GA4 callback to this connectionId
    const connectCode = crypto.randomBytes(16).toString("hex");
    const connectCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store connect_code -> connectionId mapping (10 minute TTL)
    await kvSetJson(
      `chatgpt_ga4_connect:${connectCode}`,
      { connectionId, expires: connectCodeExpires },
      600
    );

    // Build callback URL with connect_code (avoid putting connectionId in the URL)
    const redirectPath = `/api/chatgpt/oauth/ga4/callback?connect_code=${encodeURIComponent(connectCode)}`;

    const { url } = await buildGoogleAuthUrl(req, { desiredRedirect: redirectPath });

    return res.status(200).json({
      ok: true,
      auth_url: url,
      message: "Open this URL to connect Google Analytics, then return to ChatGPT.",
    });
  } catch (e) {
    console.error("[chatgpt/ga4/start] Error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
