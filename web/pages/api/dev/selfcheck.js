// web/pages/api/dev/selfcheck.js
import {
  getBearerForRequest,
  SESSION_COOKIE_NAME,
} from "../../../lib/server/ga4-session.js";

/**
 * Dev self-check: confirms we can derive a bearer from the request
 * (i.e., GA tokens exist and are not expired). Also echoes cookie presence.
 */
export default async function handler(req, res) {
  try {
    const cookiesHeader = req.headers?.cookie || "";
    const hasSessionCookie = cookiesHeader.includes(`${SESSION_COOKIE_NAME}=`);

    let bearer = null;
    let bearerOk = false;
    let bearerError = null;

    try {
      bearer = await getBearerForRequest(req);
      bearerOk = Boolean(bearer);
    } catch (e) {
      bearerError = e?.message || String(e);
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      ok: true,
      cookie: {
        name: SESSION_COOKIE_NAME,
        present: hasSessionCookie,
      },
      bearer: {
        ok: bearerOk,
        present: Boolean(bearer),
        error: bearerError,
      },
    });
  } catch (err) {
    console.error("selfcheck error:", err);
    res.status(500).json({ ok: false, error: "selfcheck_failed" });
  }
}
