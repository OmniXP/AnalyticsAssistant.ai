// web/pages/api/ga4/inspect.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Lightweight probe: confirms auth before front ends attempt heavier calls.
 */
export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ ok: true, hasBearer: Boolean(bearer) });
  } catch (err) {
    console.error("inspect error:", err);
    res.status(401).json({ ok: false, error: "no_bearer" });
  }
}
