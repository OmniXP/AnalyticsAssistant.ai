// web/lib/server/google-oauth.js
// Google OAuth (PKCE) helpers + Upstash KV to temporarily store state + verifier

// ---------- Upstash raw HTTP helpers ----------
const KV_URL = process.env.KV_URL || process.env.UPSTASH_KV_REST_URL || "";
const KV_TOKEN = process.env.KV_TOKEN || process.env.UPSTASH_KV_REST_TOKEN || "";

async function kvGetRaw(key) {
  if (!KV_URL || !KV_TOKEN) throw new Error("Upstash KV not configured");
  const resp = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(`KV get failed: ${text}`);
  return json?.result ?? null;
}
async function kvSetRaw(key, value, ttlSec) {
  if (!KV_URL || !KV_TOKEN) throw new Error("Upstash KV not configured");
  // Upstash KV REST API: value goes in URL path, not body
  const valueStr = typeof value === "string" ? value : String(value);
  const path = ttlSec != null
    ? `/set/${encodeURIComponent(key)}/${encodeURIComponent(valueStr)}?ex=${ttlSec}`
    : `/set/${encodeURIComponent(key)}/${encodeURIComponent(valueStr)}`;
  const resp = await fetch(`${KV_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(`KV set failed: ${text}`);
  return json?.result || "OK";
}
async function kvDelRaw(key) {
  if (!KV_URL || !KV_TOKEN) throw new Error("Upstash KV not configured");
  const resp = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(`KV del failed: ${text}`);
  return json?.result || 1;
}

// ---------- PKCE helpers ----------
function base64url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function randomBytes(n = 32) {
  const arr = new Uint8Array(n);
  // Node 18+ global crypto
  crypto.getRandomValues(arr);
  return Buffer.from(arr);
}
async function sha256Base64url(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64url(Buffer.from(digest));
}

export function inferOrigin(req) {
  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0] || "https";
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0];
  return `${proto}://${host}`;
}

export async function putAuthState(stateId, dataObj, ttlSec = 600) {
  const val = JSON.stringify(dataObj || {});
  await kvSetRaw(`oauth_state:${stateId}`, val, ttlSec);
}
export async function readAuthState(stateId, del = true) {
  const raw = await kvGetRaw(`oauth_state:${stateId}`);
  if (del) { try { await kvDelRaw(`oauth_state:${stateId}`); } catch {} }
  return raw ? JSON.parse(raw) : null;
}

export async function buildGoogleAuthUrl(req, { desiredRedirect }) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  if (!clientId) throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_OAUTH_CLIENT_ID");

  const origin = inferOrigin(req);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = await sha256Base64url(codeVerifier);
  const stateId = base64url(randomBytes(24));

  // Persist verifier + where to go after success
  await putAuthState(stateId, {
    code_verifier: codeVerifier,
    desiredRedirect: desiredRedirect || process.env.POST_AUTH_REDIRECT || "/",
    createdAt: Date.now(),
  });

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/analytics.edit", // optional, keep readonly if you prefer
  ].join(" "));
  params.set("code_challenge", codeChallenge);
  params.set("code_challenge_method", "S256");
  params.set("access_type", "offline");
  params.set("prompt", "consent"); // to ensure refresh_token on first grant
  params.set("state", stateId);

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    stateId,
  };
}

export async function exchangeCodeForTokens(code, codeVerifier, redirectUri) {
  const params = new URLSearchParams();
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("code", code);
  params.set("code_verifier", codeVerifier);
  params.set("grant_type", "authorization_code");
  params.set("redirect_uri", redirectUri);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    const msg = json?.error_description || json?.error || text || `HTTP ${r.status}`;
    throw new Error(`Token exchange failed: ${msg}`);
  }
  return json; // { access_token, refresh_token, expires_in, scope, token_type, id_token? }
}
