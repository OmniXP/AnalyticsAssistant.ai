// web/pages/api/dev/check-upstash.js
// Verifies we can read the SID from the cookie and reach Upstash KV.

import { getCookie } from "../../../lib/server/cookies";
import { readSidFromCookie } from "../../../lib/server/ga4-session";

export const config = { runtime: "nodejs" };

function kvConfig() {
  return {
    url: process.env.UPSTASH_KV_REST_URL || process.env.KV_REST_API_URL || "",
    token: process.env.UPSTASH_KV_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
  };
}

async function kvGetRaw(key) {
  const { url, token } = kvConfig();
  if (!url || !token) {
    return { ok: false, status: 500, error: "Upstash KV env vars missing", body: null };
  }
  const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const text = await resp.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: resp.ok, status: resp.status, error: resp.ok ? null : (json || text), body: json };
}

export default async function handler(req, res) {
  try {
    const sidFromShim = readSidFromCookie(req);
    const sidDirect = getCookie(req, "aa_sid") || getCookie(req, "aa_auth") || null;

    const env = kvConfig();
    const keysTried = [];
    const kvResults = {};

    if (sidFromShim) {
      for (const k of [
        `aa:access:${sidFromShim}`,
        `aa:ga:${sidFromShim}`,
        `ga:access:${sidFromShim}`,
      ]) {
        keysTried.push(k);
        // eslint-disable-next-line no-await-in-loop
        kvResults[k] = await kvGetRaw(k);
        if (kvResults[k]?.body?.result) break;
      }
    }

    res.status(200).json({
      ok: true,
      envPresent: { url: !!env.url, token: !!env.token },
      cookie: { aa_sid: !!getCookie(req, "aa_sid"), aa_auth: !!getCookie(req, "aa_auth") },
      sidFromShim: sidFromShim || null,
      sidDirect: sidDirect || null,
      keysTried,
      kvResults,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
