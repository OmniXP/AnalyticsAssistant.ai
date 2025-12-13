// web/pages/api/chatgpt/oauth/authorize.js
// ChatGPT OAuth 2.0 authorization endpoint for GPT Actions.
// ChatGPT provides redirect_uri dynamically - we validate against allowlist.

import crypto from "crypto";
import { kvSetJson } from "../../../../lib/server/ga4-session.js";

const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || process.env.CHATGPT_OAUTH_CLIENT_ID || "";

// Allowlist of ChatGPT callback origins (ChatGPT provides the full callback URL)
// Format: comma-separated origins like "https://chat.openai.com,https://chatgpt.com"
const ALLOWLIST_RAW = process.env.CHATGPT_REDIRECT_URI_ALLOWLIST || "https://chat.openai.com,https://chatgpt.com";
const ALLOWLIST_ORIGINS = ALLOWLIST_RAW.split(",").map(s => s.trim()).filter(Boolean);

/**
 * Validate redirect_uri against allowlist.
 * ChatGPT callback URLs are typically: https://chat.openai.com/aip/.../oauth/callback
 */
function isValidRedirectUri(redirectUri) {
  if (!redirectUri) return false;
  
  try {
    const url = new URL(redirectUri);
    const origin = url.origin;
    
    // Check if origin matches allowlist
    const originAllowed = ALLOWLIST_ORIGINS.some(allowed => {
      try {
        const allowedUrl = new URL(allowed);
        return allowedUrl.origin === origin;
      } catch {
        // If allowlist entry is just origin, compare directly
        return allowed === origin || allowed === url.origin;
      }
    });
    
    if (!originAllowed) return false;
    
    // ChatGPT callback paths typically contain /aip/.../oauth/callback
    // We allow any path from allowed origins
    return true;
  } catch (e) {
    // Invalid URL
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { client_id, redirect_uri, state, response_type, scope } = req.query || {};

  if (!client_id || client_id !== CHATGPT_CLIENT_ID) {
    return res.status(400).json({ error: "invalid_client" });
  }

  if (response_type !== "code") {
    return res.status(400).json({ error: "unsupported_response_type" });
  }

  if (!redirect_uri) {
    return res.status(400).json({ error: "invalid_redirect_uri" });
  }

  // Validate redirect_uri against allowlist (ChatGPT provides this dynamically)
  if (!isValidRedirectUri(redirect_uri)) {
    console.error("[chatgpt/oauth/authorize] Invalid redirect_uri:", redirect_uri);
    return res.status(400).json({ error: "invalid_redirect_uri" });
  }

  const code = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await kvSetJson(
    `chatgpt_oauth_code:${code}`,
    {
      client_id,
      redirect_uri,
      state: state || null,
      scope: scope || null,
      expires,
    },
    600
  );

  // Redirect back to ChatGPT's callback URL with the authorization code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}
