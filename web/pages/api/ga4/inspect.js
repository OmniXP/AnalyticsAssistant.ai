// web/pages/api/ga4/inspect.js
// Lightweight endpoint to confirm we can resolve a Google bearer from the session.

import { getBearerForRequest } from "../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { bearer, sid, source } = await getBearerForRequest(req);
    res.status(200).json({
      ok: true,
      hasBearer: Boolean(bearer),
      sid: sid || null,
      source: source || "unknown",
    });
  } catch (e) {
    const code = e.code || "ERROR";
    if (code === "NO_SESSION" || code === "NO_TOKENS" || code === "EXPIRED") {
      res.status(401).json({ ok: false, error: code, message: e.message });
      return;
    }
    res.status(500).json({ ok: false, error: "internal_error", message: e.message });
  }
}
