// web/pages/api/ga4/inspect.js
import { getBearerForRequest } from "../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    res.status(200).json({ ok: true, bearerPresent: Boolean(bearer), headers: req.headers || null });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
