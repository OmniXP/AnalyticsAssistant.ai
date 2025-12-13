// web/pages/api/chatgpt/oauth/token.js
// ChatGPT OAuth 2.0 token exchange endpoint.

import crypto from "crypto";
import { kvGetJson, kvSetJson } from "../../../../lib/server/ga4-session.js";
import { storeChatGPTToken, getOrCreateChatGPTUser } from "../../../../lib/server/chatgpt-auth.js";

// Support both naming conventions
const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || process.env.CHATGPT_OAUTH_CLIENT_ID || "";
const CHATGPT_CLIENT_SECRET = process.env.CHATGPT_CLIENT_SECRET || process.env.CHATGPT_OAUTH_CLIENT_SECRET || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { grant_type, code, client_id, client_secret, redirect_uri, chatgpt_user_id = null, email = null } = req.body || {};

  if (client_id !== CHATGPT_CLIENT_ID || client_secret !== CHATGPT_CLIENT_SECRET) {
    return res.status(401).json({ error: "invalid_client" });
  }

  if (grant_type !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }

  if (!code) {
    return res.status(400).json({ error: "invalid_grant", error_description: "Missing code" });
  }

  const codeData = await kvGetJson(`chatgpt_oauth_code:${code}`);
  if (!codeData || (codeData.expires && codeData.expires < Date.now())) {
    return res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired code" });
  }

  // Optionally verify redirect_uri matches original request
  if (codeData.redirect_uri && redirect_uri && codeData.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: "invalid_grant", error_description: "Redirect URI mismatch" });
  }

  // ChatGPT OAuth requires user identification for token exchange
  // chatgpt_user_id should be provided by ChatGPT in the token request
  const tokenPayloadUserId = chatgpt_user_id || codeData.chatgpt_user_id || null;
  const tokenPayloadEmail = email || codeData.email || null;

  if (!tokenPayloadUserId) {
    return res.status(400).json({ 
      error: "invalid_request", 
      error_description: "chatgpt_user_id is required for token exchange" 
    });
  }

  const accessToken = crypto.randomBytes(32).toString("hex");
  const expiresIn = 3600; // 1 hour

  // Ensure user exists in database (create/link if needed)
  let userId = null;
  try {
    const user = await getOrCreateChatGPTUser(tokenPayloadUserId, tokenPayloadEmail);
    userId = user.id;
  } catch (e) {
    console.error("[chatgpt/oauth/token] Failed to create/link user:", e);
    return res.status(500).json({ 
      error: "server_error", 
      error_description: "Failed to create user record" 
    });
  }

  // Persist token mapping for subsequent API calls
  try {
    await storeChatGPTToken(accessToken, tokenPayloadUserId, tokenPayloadEmail, userId, expiresIn);
  } catch (e) {
    console.error("[chatgpt/oauth/token] Failed to store token:", e);
    return res.status(500).json({ 
      error: "server_error", 
      error_description: "Failed to store access token" 
    });
  }

  // Expire the code immediately
  await kvSetJson(`chatgpt_oauth_code:${code}`, null, 1);

  return res.status(200).json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  });
}
