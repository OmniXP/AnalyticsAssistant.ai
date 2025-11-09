// web/pages/api/dev/check-upstash.js
// Verifies Upstash env and whether any token blobs exist for current SID.

import { getCookie } from "../../../lib/server/cookies";
import { readSidFromCookie, SESSION_COOKIE_NAME } from "../../../lib/server/ga4-session";

async function kvGet(key) {
  const url = process.env.UPSTASH_KV_REST_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN;
  if (!url || !token) return { ok: false, error: "Upstash KV not configured" };
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, error: j?.error || null, body: j };
}

export default async function handler(req, res) {
  const envPresent = {
    url: !!process.env.UPSTASH_KV_REST_URL,
    token: !!process.env.UPSTASH_KV_REST_TOKEN,
  };

  const sidFromCookie = readSidFromCookie(req);
  const aa_sid_cookie = getCookie(req, SESSION_COOKIE_NAME);
  const legacy = getCookie(req, "aa_auth");

  const keys = sidFromCookie
    ? [
        `aa:access:${sidFromCookie}`,
        `aa:ga:${sidFromCookie}`,
        `ga:access:${sidFromCookie}`, // legacy probe
      ]
    : [];

  const results = {};
  for (const k of keys) {
    // eslint-disable-next-line no-await-in-loop
    results[k] = await kvGet(k);
  }

  res.status(200).json({
    ok: true,
    envPresent,
    cookie: { aa_sid: !!aa_sid_cookie, aa_auth: !!legacy },
    sid: sidFromCookie || null,
    keysTried: keys,
    kvResults: results,
  });
}
