// web/pages/api/dev/oauth-env.js
export const runtime = "nodejs";

function computeBaseUrl(req) {
  const forced = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL;
  if (forced) return forced.replace(/\/$/, "");
  const host = req.headers.get?.("host") || req.headers?.host;
  const proto = req.headers.get?.("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
function resolveRedirectUri(req) {
  const fromEnv = process.env.GOOGLE_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  const base = computeBaseUrl(req);
  return `${base}/api/auth/google/callback`;
}

export default async function handler(req, res) {
  const base = computeBaseUrl(req);
  const redirectUri = resolveRedirectUri(req);
  const cid = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const csec = (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET) ? "present" : "missing";
  res.status(200).json({
    ok: true,
    base,
    redirectUri,
    clientId_tail: cid ? cid.slice(-8) : null,
    clientSecret_status: csec,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || null,
    BASE_URL: process.env.BASE_URL || null,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || null,
  });
}
