// web/pages/api/auth/google/status.js
// Returns whether we currently have a bearer token for this request.

import { getBearerForRequest } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    res.status(200).json({ connected: !!bearer });
  } catch (e) {
    res.status(200).json({ connected: false, error: String(e.message || e) });
  }
}
