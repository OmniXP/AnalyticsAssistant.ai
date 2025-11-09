// web/pages/api/dev/check-upstash.js
// Sanity checker for env, cookies, SID, and KV values for this session.

import { readSidFromCookie, SESSION_COOKIE_NAME } from "../../lib/server/ga4-session";
import { getCookie } from "../../lib/server/cookies";

async function kvGet(url, token, key) {
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, error: j?.error || null, body: j };
}

export default async function handler(req, res) {
  const url = process.env.UPSTASH_KV_REST_URL || "";
  const token = process.env.UPSTASH_KV_REST_TOKEN || "";

  const envPresent = { url: !!url, token: !!token };

  const aa_sid = !!getCookie(req, SESSION_COOKIE_NAME);
  const aa_auth = !!getCookie(req, "aa_auth"); // legacy, just for visibility

  const sidDirect = readSidFromCookie(req);
  const sidFromShim = sidDirect || getCookie(req, "aa_auth") || null;

  const keysTried = sidFromShim
    ? [`aa:access:${sidFromShim}`, `aa:ga:${sidFromShim}`, `ga:access:${sidFromShim}`]
    : [];

  const kvResults = {};
  if (url && token && sidFromShim) {
    for (const k of keysTried) {
      kvResults[k] = await kvGet(url, token, k);
    }
  }

  res.status(200).json({
    ok: true,
    envPresent,
    cookie: { aa_sid, aa_auth },
    sidFromShim,
    sidDirect,
    keysTried,
    kvResults,
  });
}
