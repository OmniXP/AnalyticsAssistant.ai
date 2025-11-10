// web/pages/api/ga4/debug-session.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Dev endpoint: shows whether we can obtain a GA bearer token.
 */
export default async function handler(req, res) {
  try {
    let bearer = null;
    let ok = false;
    let error = null;

    try {
      bearer = await getBearerForRequest(req);
      ok = Boolean(bearer);
    } catch (e) {
      error = e?.message || String(e);
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok, hasBearer: Boolean(bearer), error });
  } catch (err) {
    console.error("debug-session error:", err);
    res.status(500).json({ ok: false, error: "debug_failed" });
  }
}
