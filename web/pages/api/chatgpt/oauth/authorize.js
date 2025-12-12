// web/pages/api/chatgpt/oauth/authorize.js
// ChatGPT OAuth 2.0 authorization endpoint (separate from web app auth).

import crypto from "crypto";
import { kvSetJson } from "../../../../lib/server/ga4-session.js";

const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || "";

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

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.writeHead(302, { Location: redirectUrl.toString() });
  res.end();
}
