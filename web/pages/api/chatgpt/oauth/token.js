import crypto from "crypto";
import { kvGetJson, kvSetJson } from "../../../lib/server/ga4-session";

const CHATGPT_CLIENT_ID =
  process.env.CHATGPT_CLIENT_ID || process.env.CHATGPT_OAUTH_CLIENT_ID || "";
const CHATGPT_CLIENT_SECRET =
  process.env.CHATGPT_CLIENT_SECRET || process.env.CHATGPT_OAUTH_CLIENT_SECRET || "";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

function timingSafeEqual(a, b) {
  const aa = Buffer.from(a || "");
  const bb = Buffer.from(b || "");
  if (aa.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function parseForm(req) {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req.body === "string") {
    const params = new URLSearchParams(req.body);
    return Object.fromEntries(params.entries());
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  console.log("[chatgpt/oauth/token] IN", { contentType: req.headers["content-type"] });

  const body = parseForm(req);
  const { grant_type, code, client_id, client_secret } = body;

  if (!CHATGPT_CLIENT_ID || !CHATGPT_CLIENT_SECRET) {
    return res.status(500).json({ error: "server_misconfigured" });
  }

  if (String(client_id) !== CHATGPT_CLIENT_ID || !timingSafeEqual(String(client_secret), CHATGPT_CLIENT_SECRET)) {
    return res.status(401).json({ error: "invalid_client" });
  }

  if (grant_type !== "authorization_code" || !code) {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }

  const codeKey = `chatgpt:oauth:code:${code}`;
  const codeData = await kvGetJson(codeKey);

  if (!codeData?.email || codeData.used) {
    return res.status(400).json({ error: "invalid_grant" });
  }

  // mark as used (cheap one-time redemption)
  await kvSetJson(codeKey, { used: true }, 5);

  const access_token = crypto.randomBytes(32).toString("hex");
  await kvSetJson(
    `chatgpt:oauth:token:${access_token}`,
    { email: codeData.email, scope: codeData.scope || "" },
    ACCESS_TOKEN_TTL_SECONDS
  );

  return res.status(200).json({
    access_token,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: codeData.scope || "",
  });
}
