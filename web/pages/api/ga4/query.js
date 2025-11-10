// web/pages/api/ga4/query.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Preset GA4 queries. Front end can pass minimal params; we expand here.
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

    // Implement your presets; for now return a stub that compiles.
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok: true, preset: "stub" });
  } catch (err) {
    console.error("query error:", err);
    res.status(500).json({ ok: false, error: "query_failed" });
  }
}
