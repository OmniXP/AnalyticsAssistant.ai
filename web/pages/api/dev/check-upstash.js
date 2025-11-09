// web/pages/api/dev/check-upstash.js
import { getKvEnvStatus, kvSet, kvGet } from "../../../lib/server/kv";
import { getCookie } from "../../../lib/server/cookies";

export default async function handler(req, res) {
  try {
    // Report env presence
    const env = getKvEnvStatus();

    // Try to identify a session id so we can show the exact keys we would use
    const aaSid = getCookie(req, "aa_sid");
    const aaAuth = getCookie(req, "aa_auth");

    const sid = aaSid || aaAuth || "no-sid-cookie";
    const keysTried = [
      `aa:access:${sid}`,
      `aa:ga:${sid}`,
      `ga:access:${sid}`,
    ];

    // Attempt a round-trip write/read if env looks present
    let roundTrip = { ok: false, error: null };
    if (env.urlPresent && env.tokenPresent) {
      try {
        await kvSet("aa:kvtest:ping", "pong");
        const got = await kvGet("aa:kvtest:ping");
        // Upstash returns { result: "pong" }
        roundTrip.ok = got?.result === "pong";
        if (!roundTrip.ok) {
          roundTrip.error = `Unexpected GET result: ${JSON.stringify(got)}`;
        }
      } catch (e) {
        roundTrip.error = String(e.message || e);
      }
    }

    // Optionally probe the specific keys (only if env present)
    const kvResults = {};
    if (env.urlPresent && env.tokenPresent) {
      for (const k of keysTried) {
        try {
          const r = await kvGet(k);
          kvResults[k] = { ok: true, status: 200, error: null, body: r };
        } catch (e) {
          kvResults[k] = { ok: false, error: String(e.message || e) };
        }
      }
    } else {
      for (const k of keysTried) {
        kvResults[k] = { ok: false, error: "Upstash KV not configured" };
      }
    }

    res.status(200).json({
      ok: true,
      envPresent: { url: env.urlPresent, token: env.tokenPresent },
      cookie: { aa_sid: Boolean(aaSid), aa_auth: Boolean(aaAuth) },
      sid,
      keysTried,
      roundTrip,
      kvResults,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
