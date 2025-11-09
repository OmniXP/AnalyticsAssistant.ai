// web/lib/server/kv.js
// Minimal Upstash KV client using REST URL/TOKEN from env

export function getKvEnvStatus() {
  const url = process.env.UPSTASH_KV_REST_URL || "";
  const token = process.env.UPSTASH_KV_REST_TOKEN || "";
  return {
    urlPresent: Boolean(url),
    tokenPresent: Boolean(token),
    url,
    tokenMasked: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : "",
  };
}

export async function kvSet(key, value) {
  const { urlPresent, tokenPresent } = getKvEnvStatus();
  if (!urlPresent || !tokenPresent) {
    const missing = [];
    if (!urlPresent) missing.push("UPSTASH_KV_REST_URL");
    if (!tokenPresent) missing.push("UPSTASH_KV_REST_TOKEN");
    const err = new Error(`Upstash KV not configured: missing ${missing.join(", ")}`);
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  const url = process.env.UPSTASH_KV_REST_URL.replace(/\/+$/, "") + "/set";
  const token = process.env.UPSTASH_KV_REST_TOKEN;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash SET failed: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}

export async function kvGet(key) {
  const { urlPresent, tokenPresent } = getKvEnvStatus();
  if (!urlPresent || !tokenPresent) {
    const missing = [];
    if (!urlPresent) missing.push("UPSTASH_KV_REST_URL");
    if (!tokenPresent) missing.push("UPSTASH_KV_REST_TOKEN");
    const err = new Error(`Upstash KV not configured: missing ${missing.join(", ")}`);
    err.code = "KV_NOT_CONFIGURED";
    throw err;
  }
  const url = process.env.UPSTASH_KV_REST_URL.replace(/\/+$/, "") + "/get";
  const token = process.env.UPSTASH_KV_REST_TOKEN;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstash GET failed: ${res.status} ${text}`);
  }
  return res.json().catch(() => ({}));
}
