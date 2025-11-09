// web/pages/api/ga4/debug-session.js
// Returns whether a usable GA bearer token is present for this request.

import { getBearerForRequest } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req).catch(() => null);
    res.status(200).json({ ok: true, hasBearer: !!bearer });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
