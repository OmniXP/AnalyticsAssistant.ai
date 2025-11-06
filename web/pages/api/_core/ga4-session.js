// --- Replace ONLY the KV helpers below ---

async function kvGetRaw(key) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  const resp = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash KV get error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  // KV returns { result: "<raw string value>" | null }
  return json?.result ?? null;
}

async function kvSetRaw(key, value, ttlSec) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  const qs = ttlSec ? `?expiration_ttl=${encodeURIComponent(ttlSec)}` : '';
  // IMPORTANT: send the raw value as the request body (text/plain),
  // not an object like { value: "..." } — otherwise KV stores the JSON itself.
  const resp = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: typeof value === 'string' ? value : String(value),
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash KV set error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json; // typically { result: "OK" }
}

async function kvDelRaw(key) {
  if (!KV_URL || !KV_TOKEN) throw new Error('Upstash KV not configured');
  const resp = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  if (!resp.ok) {
    const msg = json || text || `HTTP ${resp.status}`;
    throw new Error(`Upstash KV del error: ${resp.status} :: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return json; // typically { result: 1 }
}
