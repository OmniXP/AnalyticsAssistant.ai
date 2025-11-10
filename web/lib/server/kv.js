// web/lib/server/kv.js
// Minimal Upstash KV helpers (REST). Server-only.

const BASE = process.env.UPSTASH_KV_REST_URL;
const TOKEN = process.env.UPSTASH_KV_REST_TOKEN;

function assertConfigured() {
  if (!BASE || !TOKEN) {
    const e = new Error("Upstash KV not configured");
    e.code = "KV_NOT_CONFIGURED";
    throw e;
  }
}

async function kvFetch(path, init = {}) {
  assertConfigured();
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export async function kvGet(key) {
  return kvFetch(`/get/${encodeURIComponent(key)}`);
}

export async function kvSet(key, value, ttlSeconds) {
  const path = ttlSeconds != null
    ? `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${ttlSeconds}`
    : `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  return kvFetch(path, { method: "POST" });
}

export async function kvDel(key) {
  return kvFetch(`/del/${encodeURIComponent(key)}`, { method: "POST" });
}
