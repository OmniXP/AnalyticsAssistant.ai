// web/pages/api/auth/google/status.js
// Returns whether GA tokens exist in Upstash for this SID.

import { readSidFromCookie } from "../../../../lib/server/ga4-session";

async function upstashGet(key) {
  const url = process.env.UPSTASH_KV_REST_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash KV not configured");
  const endpoint = `${url}/get/${encodeURIComponent(key)}`;
  const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Upstash get failed: ${r.status}`);
  return j?.result ?? null;
}

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(200).json({ ok: true, hasTokens: false, reason: "no_sid" });

    const v = await upstashGet(`aa:ga:${sid}`).catch(() => null);
    const ok = !!v;
    res.status(200).json({ ok: true, hasTokens: ok });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
