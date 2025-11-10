// web/pages/api/ga4/query-raw.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Raw GA4 query passthrough. Expects body with { propertyId, report } etc.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) {
      return res.status(401).json({ ok: false, error: "no_bearer" });
    }

    // Your existing runReport forwarding would be here.
    // Leaving a simple stub to keep this file compiling.
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok: true, forwarded: false });
  } catch (err) {
    console.error("query-raw error:", err);
    res.status(500).json({ ok: false, error: "query_raw_failed" });
  }
}
