// web/pages/api/ga4/debug-session.js
// Simple inspector to help verify that a GA4 bearer can be produced for this request.

import * as session from "../../../lib/server/ga4-session";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const { token, meta, sid } = await session.getBearerForRequest(req);

    return res.status(200).json({
      ok: !!token,
      hasToken: !!token,
      tokenPreview: token ? token.slice(0, 12) + "…" : null,
      meta: meta || null,
      sidPresent: !!sid,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
