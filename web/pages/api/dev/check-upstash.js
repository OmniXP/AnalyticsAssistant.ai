import { readSidFromCookie } from '../_core/ga4-session';
export const config = { runtime: 'nodejs' };

const R_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

async function tryRedis(key, value) {
  if (!R_URL || !R_TOKEN) return { configured: false };
  async function cmd(c) {
    const r = await fetch(R_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: c }),
      cache: 'no-store',
    });
    const t = await r.text(); let j=null; try{j=JSON.parse(t);}catch{}
    return { ok: r.ok, status: r.status, body: j || t };
  }
  const set = await cmd(['SET', key, value, 'EX', '30']);
  const get = await cmd(['GET', key]);
  const del = await cmd(['DEL', key]);
  return { configured: true, set, get, del };
}

async function tryKV(key, value) {
  if (!KV_URL || !KV_TOKEN) return { configured: false };
  const set = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, expiration_ttl: 30 }),
    cache: 'no-store',
  }); const setT = await set.text(); let setJ=null; try{setJ=JSON.parse(setT);}catch{}
  const get = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }, cache: 'no-store',
  }); const getT = await get.text(); let getJ=null; try{getJ=JSON.parse(getT);}catch{}
  const del = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` }, cache: 'no-store',
  }); const delT = await del.text(); let delJ=null; try{delJ=JSON.parse(delT);}catch{}
  return {
    configured: true,
    set: { ok: set.ok, status: set.status, body: setJ || setT },
    get: { ok: get.ok, status: get.status, body: getJ || getT },
    del: { ok: del.ok, status: del.status, body: delJ || delT },
  };
}

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    const key = `aa:diagnostic:${sid || 'no-sid'}`;
    const value = 'ok';

    const kv = await tryKV(key, value);
    const redis = await tryRedis(key, value);

    res.status(200).json({
      sidFound: !!sid,
      kv,
      redis,
      note: 'Endpoint sets/gets/dels a 30s temp key on both backends to verify connectivity.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'check-upstash failed', message: e?.message || String(e) });
  }
}
