// web/pages/api/dev/check-upstash.js
// Server-only check that confirms the two required env vars are present
// and attempts a round-trip to Upstash KV using fetch.

export default async function handler(req, res) {
  const url = process.env.UPSTASH_KV_REST_URL || "";
  const token = process.env.UPSTASH_KV_REST_TOKEN || "";

  const envPresent = { url: !!url, token: !!token };
  const envSources = {
    url: url ? "UPSTASH_KV_REST_URL" : null,
    token: token ? "UPSTASH_KV_REST_TOKEN" : null,
  };

  // Pull session ids from cookies if present (optional, just for context)
  const rawCookie = req.headers?.cookie || "";
  const aa_sid = rawCookie.includes("aa_sid=");
  const aa_auth = rawCookie.includes("aa_auth=");

  const sid = (rawCookie.match(/aa_sid=([^;]+)/)?.[1]) || null;
  const keysTried = sid ? [
    `aa:access:${sid}`,
    `aa:ga:${sid}`,
    `ga:access:${sid}`,
  ] : [];

  let roundTrip = { ok: false, error: null };
  const kvResults = {};

  // Only attempt if both vars exist
  if (envPresent.url && envPresent.token) {
    try {
      // Write → Read → Delete a ping key
      const pingKey = `dev:ping:${Date.now()}`;
      const writeResp = await fetch(`${url}/set/${encodeURIComponent(pingKey)}/${encodeURIComponent("ok")}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const writeBody = await safeJson(writeResp);

      const readResp = await fetch(`${url}/get/${encodeURIComponent(pingKey)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const readBody = await safeJson(readResp);

      const delResp = await fetch(`${url}/del/${encodeURIComponent(pingKey)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const delBody = await safeJson(delResp);

      roundTrip = {
        ok: writeResp.ok && readResp.ok && delResp.ok && readBody?.result === "ok",
        write: { status: writeResp.status, body: writeBody },
        read: { status: readResp.status, body: readBody },
        del: { status: delResp.status, body: delBody },
      };

      // Optionally show what happens for your session keys
      for (const k of keysTried) {
        try {
          const r = await fetch(`${url}/get/${encodeURIComponent(k)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          kvResults[k] = { ok: r.ok, status: r.status, body: await safeJson(r) };
        } catch (e) {
          kvResults[k] = { ok: false, error: String(e?.message || e) };
        }
      }
    } catch (e) {
      roundTrip = { ok: false, error: String(e?.message || e) };
    }
  }

  res.status(200).json({
    ok: true,
    envPresent,
    envSources,
    cookie: { aa_sid, aa_auth },
    sid,
    keysTried,
    roundTrip,
    kvResults,
  });
}

async function safeJson(resp) {
  try {
    const txt = await resp.text();
    try { return JSON.parse(txt); } catch { return { raw: txt }; }
  } catch {
    return null;
  }
}
