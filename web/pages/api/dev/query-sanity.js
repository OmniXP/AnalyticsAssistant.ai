// web/pages/api/dev/query-sanity.js
import { getBearerForRequest } from "../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    res.status(200).json({
      ok: true,
      bearerPresent: Boolean(bearer),
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
