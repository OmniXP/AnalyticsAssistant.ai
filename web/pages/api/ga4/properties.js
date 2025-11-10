// web/pages/api/ga4/properties.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Lists GA4 properties for the authenticated user via the Analytics Admin API.
 * Keep minimal for now; front end can call this after auth.
 */
export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) {
      return res.status(401).json({ ok: false, error: "no_bearer" });
    }

    // Example fetch to Admin API could go here; we return a stub for now.
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok: true, properties: [] });
  } catch (err) {
    console.error("properties error:", err);
    res.status(500).json({ ok: false, error: "properties_failed" });
  }
}
