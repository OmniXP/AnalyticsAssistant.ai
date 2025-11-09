// web/pages/api/_core/ga4-session.js
// Single place to read/write GA tokens from iron-session and auto-refresh when needed.

import { getIronSession } from "iron-session";
import { refreshAccessToken } from "./google-oauth.js";

export const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

function makeResStub() {
  // Allows reading a session even if caller doesn't pass `res`.
  return {
    getHeader() { return undefined; },
    setHeader() { /* no-op */ },
    statusCode: 200,
    end() { /* no-op */ },
  };
}

function tokenExpired(tokens) {
  if (!tokens) return true;
  const now = Date.now();
  const exp = Number(tokens.expiry_date || 0);
  // Refresh if we are within ~30s of expiry.
  return !exp || exp - now < 30_000;
}

/**
 * Get a valid bearer token from the request's session.
 * If expired and a refresh_token exists, refresh automatically and save.
 *
 * Exported API surface mirrors previous usage across your routes:
 *   const { token } = await session.getBearerForRequest(req);    // res optional
 */
export async function getBearerForRequest(req, res) {
  const resSafe = res || makeResStub();

  const sess = await getIronSession(req, resSafe, sessionOptions);
  const tokens = sess.gaTokens;

  if (!tokens?.access_token) {
    return { token: null };
  }

  // If token is still valid, return it.
  if (!tokenExpired(tokens)) {
    return { token: tokens.access_token };
  }

  // Try to refresh if possible.
  if (!tokens.refresh_token) {
    // Cannot refresh, session present but expired.
    return { token: null };
  }

  try {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    // Persist back into the session.
    sess.gaTokens = {
      ...tokens,
      ...refreshed,
      // ensure we keep a stable shape
      expiry_date: refreshed.expiry_date,
      refresh_token: tokens.refresh_token || refreshed.refresh_token,
    };
    await sess.save();
    return { token: sess.gaTokens.access_token || null };
  } catch (e) {
    // Refresh failed, wipe tokens so the UI can prompt re-auth.
    try {
      delete sess.gaTokens;
      await sess.save();
    } catch {}
    return { token: null };
  }
}

/**
 * Helper to read the raw tokens, if a route needs them.
 */
export async function getSessionTokens(req, res) {
  const resSafe = res || makeResStub();
  const sess = await getIronSession(req, resSafe, sessionOptions);
  return sess.gaTokens || null;
}

/**
 * Helper to store tokens (used by the OAuth callback).
 */
export async function setSessionTokens(req, res, tokens) {
  const resSafe = res || makeResStub();
  const sess = await getIronSession(req, resSafe, sessionOptions);
  sess.gaTokens = tokens || null;
  await sess.save();
  return true;
}

/**
 * Helper to clear tokens (used by disconnect endpoint).
 */
export async function clearSessionTokens(req, res) {
  const resSafe = res || makeResStub();
  const sess = await getIronSession(req, resSafe, sessionOptions);
  try {
    delete sess.gaTokens;
  } catch {}
  await sess.save();
  return true;
}

export default {
  getBearerForRequest,
  getSessionTokens,
  setSessionTokens,
  clearSessionTokens,
  sessionOptions,
};
