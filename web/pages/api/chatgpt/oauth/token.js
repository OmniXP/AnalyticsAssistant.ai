// web/pages/api/chatgpt/oauth/token.js
// ChatGPT OAuth 2.0 token exchange endpoint for GPT Actions.
// Handles application/x-www-form-urlencoded body format.

import crypto from "crypto";
import { kvGetJson, kvSetJson } from "../../../../lib/server/ga4-session.js";

// Support both naming conventions
const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || process.env.CHATGPT_OAUTH_CLIENT_ID || "";
const CHATGPT_CLIENT_SECRET = process.env.CHATGPT_CLIENT_SECRET || process.env.CHATGPT_OAUTH_CLIENT_SECRET || "";

/**
 * Parse request body safely (handles application/x-www-form-urlencoded).
 */
function parseFormBody(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    try {
      const params = new URLSearchParams(req.body);
      return Object.fromEntries(params.entries());
    } catch (e) {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseFormBody(req);
  const { grant_type, code, client_id, client_secret, redirect_uri } = body;

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

  // Verify redirect_uri matches original request
  if (codeData.redirect_uri && redirect_uri && codeData.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: "invalid_grant", error_description: "Redirect URI mismatch" });
  }

  // Create a connection identity for this ChatGPT auth session
  const connectionId = crypto.randomUUID();
  const accessToken = crypto.randomBytes(32).toString("hex");
  const expiresIn = 3600; // 1 hour

  // Store token with connectionId (no chatgpt_user_id required)
  await kvSetJson(
    `chatgpt_token:${accessToken}`,
    {
      connectionId,
      scope: codeData.scope || null,
      expires: Date.now() + expiresIn * 1000,
    },
    expiresIn
  );

  // Invalidate the one-time code immediately
  await kvSetJson(`chatgpt_oauth_code:${code}`, null, 1);

  return res.status(200).json({
    access_token: accessToken,
    token_type: "bearer", // lowercase as per OAuth spec
    expires_in: expiresIn,
  });
}
