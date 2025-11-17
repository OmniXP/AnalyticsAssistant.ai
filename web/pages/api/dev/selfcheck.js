// web/pages/api/dev/selfcheck.js
import { getBearerForRequest, SESSION_COOKIE_NAME } from "../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    res.status(200).json({
      ok: true,
      cookie: {
        name: SESSION_COOKIE_NAME,
        present: Boolean(req.headers?.cookie?.includes(SESSION_COOKIE_NAME)),
      },
      bearer: {
        ok: Boolean(bearer),
        present: Boolean(bearer),
        error: null,
      },
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      error: e.message || String(e),
    });
  }
}
