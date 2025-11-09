// web/lib/server/ga4-session.js
// GA4 session helpers used by API routes to resolve a Google access token from the user's session.
// Reads the SID cookie, looks up the access token in Upstash KV, and returns a bearer token for GA4 requests.

import { getCookie, setCookie, clearCookie } from "./cookies";

export const SESSION_COOKIE_NAME = "aa_sid";       // canonical session id cookie
export const LEGACY_AUTH_COOKIE = "aa_auth";       // legacy auth cookie (kept for backwards compatibility)

// --- Cookie helpers ---------------------------------------------------------

/** Read the current session id (SID) from cookies */
export function readSidFromCookie(req) {
  const sid = getCookie(req, SESSION_COOKIE_NAME);
  if (sid && typeof sid === "string" && sid.trim()) return sid.trim();

  // Legacy fallback if you previously stored a raw token in aa_auth
  const legacy = getCookie(req, LEGACY_AUTH_COOKIE);
  return legacy && legacy.trim() ? legacy.trim() : null;
}

/** Write/refresh the SID cookie */
export function writeSidCookie(res, sid, opts = {}) {
  if (!sid) return;
  const secure = process.env.NODE_ENV === "production";
  setCookie(res, SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    // 30 days by default; callers can override with opts.maxAge/opts.expires
    maxAge: opts.maxAge != null ? opts.maxAge : 60 * 60 * 24 * 30,
    ...opts,
  });
}

/** Clear the SID cookie */
export function clearSidCookie(res) {
  clearCookie(res, SESSION_COOKIE_NAME);
  // best-effort legacy clear
  clearCookie(res, LEGACY_AUTH_COOKIE);
}

// --- Upstash KV helpers -----------------------------------------------------

function upstashConfig() {
  const url = process.env.UPSTASH_KV_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return { url, token };
}

/** GET a JSON value from Upstash KV. Returns { ok, value } */
async function kvGetJSON(key) {
  const { url, token } = upstashConfig();
  if (!url || !token) return { ok: false, value: null, status: 500, error: "Upstash not configured" };

  try {
    // Upstash REST GET: GET {url}/get/{key}
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

    if (!resp.ok) {
      return { ok: false, value: null, status: resp.status, error: json || text || "kv get failed" };
    }

    // Upstash returns { "result": "string-or-null" }
    const raw = json?.result ?? null;
    if (!raw) return { ok: true, value: null, status: 200 };

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    return { ok: true, value: parsed, status: 200 };
  } catch (e) {
    return { ok: false, value: null, status: 500, error: String(e?.message || e) };
  }
}

/** Resolve GA access token for a SID from KV. Tries common key shapes. */
async function getAccessTokenForSid(sid) {
  if (!sid) return null;

  // Try a few likely key names (covers earlier iterations)
  const keys = [
    `aa:access:${sid}`,       // preferred
    `aa:ga:${sid}`,          // older
    `ga:access:${sid}`,      // older alt
  ];

  for (const k of keys) {
    const got = await kvGetJSON(k);
    if (got.ok && got.value) {
      // If the record is an object, prefer value.access_token
      if (typeof got.value === "object" && got.value) {
        if (got.value.access_token) return String(got.value.access_token);
        if (got.value.token) return String(got.value.token);
      }
      // Otherwise assume the value is the token string
      if (typeof got.value === "string") return got.value;
    }
  }

  return null;
}

// --- Public API used by API routes -----------------------------------------

/**
 * getBearerForRequest(req)
 * Returns { token, sid, reason? }
 * - Reads SID cookie.
 * - If an Authorization: Bearer header exists, uses that directly.
 * - Otherwise resolves the GA access_token from Upstash KV by SID.
 */
export async function getBearerForRequest(req) {
  // 1) If caller already passed a Bearer header, prefer it.
  const auth = req.headers?.authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (m && m[1]) {
    return { token: m[1], sid: null };
  }

  // 2) Read our SID cookie
  const sid = readSidFromCookie(req);
  if (!sid) return { token: null, sid: null, reason: "no_sid" };

  // 3) Resolve access token from KV
  const token = await getAccessTokenForSid(sid);
  if (!token) return { token: null, sid, reason: "no_access_token_for_sid" };

  return { token, sid };
}

/**
 * Optional utility to persist a fresh access_token for a SID after OAuth callback
 * if you want to manage KV writes here rather than in the callback handler.
 * Not required for reads; included for completeness.
 */
export async function saveAccessTokenForSid(_sid, _token, _ttlSeconds = 3600) {
  // Intentionally omitted to keep this file read-focused.
  // Your OAuth callback likely already writes the KV record.
  return { ok: true };
}
