import { getServerSession } from "next-auth/next";
import crypto from "crypto";
import { authOptions } from "../../../lib/authOptions";
import { kvSetJson } from "../../../lib/server/ga4-session";

const CHATGPT_CLIENT_ID =
  process.env.CHATGPT_CLIENT_ID || process.env.CHATGPT_OAUTH_CLIENT_ID || "";

const AUTH_CODE_TTL_SECONDS = 10 * 60;

function randomCode() {
  return crypto.randomBytes(32).toString("hex");
}

export default async function handler(req, res) {
  const { response_type, client_id, redirect_uri, scope, state } = req.query;

  console.log("[chatgpt/oauth/authorize] IN", {
    response_type,
    client_id,
    redirect_uri,
    scope,
    statePresent: Boolean(state),
  });

  if (response_type !== "code" || !client_id || !redirect_uri || !state) {
    return res.status(400).send("invalid_request");
  }

  if (!CHATGPT_CLIENT_ID || String(client_id) !== CHATGPT_CLIENT_ID) {
    return res.status(401).send("invalid_client");
  }

  let redirectUrl;
  try {
    redirectUrl = new URL(String(redirect_uri));
  } catch {
    return res.status(400).send("invalid_redirect_uri");
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.email) {
    const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
    const fullUrl = `${proto}://${req.headers.host}${req.url}`;
    const nextAuthSignIn = `/api/auth/signin?callbackUrl=${encodeURIComponent(fullUrl)}`;

    console.log("[chatgpt/oauth/authorize] BOUNCE", { nextAuthSignIn });

    res.writeHead(302, { Location: nextAuthSignIn });
    return res.end();
  }

  const email = session.user.email;
  const code = randomCode();

  await kvSetJson(
    `chatgpt:oauth:code:${code}`,
    { email, scope: typeof scope === "string" ? scope : "" },
    AUTH_CODE_TTL_SECONDS
  );

  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", String(state));

  console.log("[chatgpt/oauth/authorize] OUT", { redirectTo: redirectUrl.toString() });

  res.writeHead(302, { Location: redirectUrl.toString() });
  return res.end();
}
