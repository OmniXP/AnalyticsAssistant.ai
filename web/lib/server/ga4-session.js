// web/lib/server/ga4-session.js
// Store Google tokens in an HTTP-only cookie. Refresh automatically when needed.

import { setCookie, getCookie, clearCookie } from "./cookies.js";

const COOKIE_NAME = process.env.GA_COOKIE_NAME || "ga_tokens";
const SECURE = process.env.NODE_ENV === "production";

// Persist tokens in cookie. We keep only what's needed.
export function setSessionTokens(res, tokens) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = tokens.expires_in ? now + Number(tokens.expires_in) - 60 : (tokens.expires_at || now + 3000);

  const publicShape = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token, // may be undefined on refresh
    scope: tokens.scope,
    token_type: tokens.token_type,
    expires_at: expiresAt,
  };

  const payload = Buffer.from(JSON.stringify(publicShape), "utf8").toString("base64");
  setCookie(res, COOKIE_NAME, payload, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE,
    path: "/",
    // maxAge mirrors access token lifespan; refresh token can extend beyond
    maxAge: Math.max(60, (publicShape.expires_at - now)),
  });

  return publicShape;
}

export function getSessionTokens(req) {
  try {
    const raw = getCookie(req, COOKIE_NAME);
    if (!raw) return null;
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return decoded;
  } catch {
    return null;
  }
}

export function clearSessionTokens(res) {
  clearCookie(res, COOKIE_NAME);
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams();
  params.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  params.set("client_secret", process.env.GOOGLE_CLIENT_SECRET || "");
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    const msg = json?.error_description || json?.error || text || `HTTP ${r.status}`;
    throw new Error(`Token refresh failed: ${msg}`);
  }
  return json; // { access_token, expires_in, scope, token_type, ... }
}

// Returns an access token, refreshing if needed. Mutates cookie if refreshed.
export async function getBearerForRequest(req, res) {
  const tokens = getSessionTokens(req);
  if (!tokens?.access_token) return { token: null, tokens: null };

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at && tokens.expires_at > now + 30) {
    return { token: tokens.access_token, tokens };
  }

  // Expired or near expiry; refresh if we can
  if (!tokens.refresh_token) {
    return { token: null, tokens: null };
  }

  const refreshed = await refreshAccessToken(tokens.refresh_token);
  const merged = {
    ...tokens,
    ...refreshed,
    // Keep original refresh_token if Google did not return it
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
  };

  const saved = setSessionTokens(res, merged);
  return { token: saved.access_token, tokens: saved };
}
