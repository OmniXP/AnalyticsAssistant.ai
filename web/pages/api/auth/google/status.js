// web/pages/api/auth/google/status.js
// Returns whether the current request has a valid GA4 OAuth bearer available.

import * as session from "../../../../lib/server/ga4-session";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const { token, meta } = await session.getBearerForRequest(req);
    if (!token) {
      return res.status(200).json({ connected: false });
    }

    return res.status(200).json({
      connected: true,
      // meta fields are optional; shown when available
      expiresAt: meta?.expiresAt || null,
      scope: meta?.scope || null,
      email: meta?.email || null,
    });
  } catch (e) {
    return res.status(200).json({ connected: false, error: String(e?.message || e) });
  }
}
