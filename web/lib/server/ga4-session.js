// web/lib/server/ga4-session.js
// Handles: session cookie (aa_sid) and GA token storage in Upstash KV.

import { kvGet, kvSet, kvDel } from "./kv.js";
import { getCookie, setCookie } from "./cookies.js";

export const SESSION_COOKIE_NAME = "aa_sid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const KV_PREFIX = "aa:ga:";               // token storage per session id
const ACCESS_TTL = 60 * 60;               // 1 hour (Google access tokens)

export function ensureSid(req, res) {
  let sid = getCookie(req, SESSION_COOKIE_NAME);
  if (!sid) {
    sid = crypto.randomUUID();
    setCookie(res, SESSION_COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return sid;
}

export function readSidFromCookie(req) {
  return getCookie(req, SESSION_COOKIE_NAME) || null;
}

export async function saveGoogleTokens(sid, tokens) {
  // tokens: { access_token, refresh_token?, expires_in, scope, token_type, id_token? }
  if (!sid) throw new Error("No session id");
  const payload = JSON.stringify({
    ...tokens,
    stored_at: Date.now(),
    expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
  });
  await kvSet(KV_PREFIX + sid, payload, ACCESS_TTL); // refresh on write; simple path
}

export async function getGoogleTokens(sid) {
  if (!sid) return null;
  const { body } = await kvGet(KV_PREFIX + sid);
  const raw = body?.result ?? null;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearGoogleTokens(sid) {
  if (!sid) return;
  await kvDel(KV_PREFIX + sid);
}

export function isExpired(tokens) {
  if (!tokens?.expires_at) return true;
  return Date.now() > tokens.expires_at - 10_000; // 10s skew
}

// Returns { bearer } or throws Error with .code
export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) {
    const e = new Error("No session cookie");
    e.code = "NO_SESSION";
    throw e;
  }
  const tokens = await getGoogleTokens(sid);
  if (!tokens) {
    const e = new Error("No Google tokens");
    e.code = "NO_TOKENS";
    throw e;
  }
  if (isExpired(tokens)) {
    const e = new Error("Google tokens expired");
    e.code = "EXPIRED";
    throw e;
  }
  return { bearer: `${tokens.token_type || "Bearer"} ${tokens.access_token}`, sid, tokens };
}
