// web/pages/api/dev/check-upstash.js
import { readSidFromCookie } from '../../lib/server/ga4-session';

export default async function handler(req, res) {
  try {
    const sid = await readSidFromCookie(req, res).catch(() => null);

    const KV_URL = process.env.UPSTASH_KV_REST_URL || '';
    const KV_TOKEN = process.env.UPSTASH_KV_REST_TOKEN || '';

    async function kvFetch(path, init) {
      const resp = await fetch(`${KV_URL}${path}`, {
        ...(init || {}),
        headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(init?.headers || {}) },
        cache: 'no-store',
      });
      const text = await resp.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
      return { ok: resp.ok, status: resp.status, body: json ?? text };
    }

    const key = `__aa_kv_probe_${Date.now()}`;
    const set = await kvFetch(`/set/${encodeURIComponent(key)}?expiration_ttl=30`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'ok',
    });
    const get = await kvFetch(`/get/${encodeURIComponent(key)}`);
    const del = await kvFetch(`/del/${encodeURIComponent(key)}`, { method: 'POST' });

    return res.status(200).json({
      sidFound: !!sid,
      kv: {
        configured: !!(KV_URL && KV_TOKEN),
        set, get, del,
      },
      redis: { configured: false }, // if you add Upstash Redis later
      note: 'Endpoint sets/gets/dels a 30s temp key on both backends to verify connectivity.',
    });
  } catch (e) {
    return res.status(500).json({ error: 'check-upstash_failed', message: String(e?.message || e) });
  }
}
