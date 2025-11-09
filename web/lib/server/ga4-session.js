// web/lib/server/ga4-session.js
// Session & token storage helpers backed by Upstash KV (REST).

import crypto from "crypto";
import { getCookie, setCookie } from "./cookies";

export const SESSION_COOKIE_NAME = "aa_sid";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function getKvConfig() {
  const url = process.env.UPSTASH_KV_REST_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash KV not configured");
  }
  return { url, token };
}

async function kvGet(key) {
  const { url, token } = getKvConfig();
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  return j?.result ?? null;
}

async function kvSet(key, value, ttlSeconds) {
  const { url, token } = getKvConfig();
  const body = typeof value === "string" ? value : JSON.stringify(value);
  const r = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(body)}${ttlSeconds ? `?ex=${ttlSeconds}` : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  return j?.result === "OK";
}

export function readSidFromCookie(req) {
  return getCookie(req, SESSION_COOKIE_NAME);
}

export function ensureSid(req, res) {
  let sid = readSidFromCookie(req);
  if (!sid) {
    sid = crypto.randomUUID();
    setCookie(res, SESSION_COOKIE_NAME, sid, {
      maxAge: COOKIE_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return sid;
}

// Store Google tokens for an SID. Optionally set an expiry (seconds).
export async function setGaTokens(sid, tokens) {
  // Primary keys used by this app:
  await kvSet(`aa:ga:${sid}`, tokens, tokens?.expires_in ? Number(tokens.expires_in) : undefined);
  if (tokens?.access_token) {
    await kvSet(`aa:access:${sid}`, { access_token: tokens.access_token, expiry: Date.now() + (tokens.expires_in || 0) * 1000 }, tokens?.expires_in ? Number(tokens.expires_in) : undefined);
  }
}

// Return a bearer token if any is available for the current request.
export async function getBearerForRequest(req) {
  const sid = readSidFromCookie(req);
  if (!sid) return null;

  // Prefer fresh access token
  const a = await kvGet(`aa:access:${sid}`);
  if (a?.access_token) return `Bearer ${a.access_token}`;

  // Fallback to full token object, if present
  const obj = await kvGet(`aa:ga:${sid}`);
  if (obj?.access_token) return `Bearer ${obj.access_token}`;

  // Legacy key fallback (if you had older keys)
  const legacy = await kvGet(`ga:access:${sid}`);
  if (legacy?.access_token) return `Bearer ${legacy.access_token}`;

  return null;
}
