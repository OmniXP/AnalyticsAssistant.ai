// web/pages/api/ga4/properties.js
// Lists GA4 properties visible to the authorised user.

import { getBearerForRequest } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const r = await fetch("https://analyticsadmin.googleapis.com/v1beta/properties?pageSize=50", {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const j = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 500).json(j);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
