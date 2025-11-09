// web/pages/api/ga4/inspect.js
// Pings GA Data API with a minimal request to confirm auth + property format.

import { getBearerForRequest } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const propertyId = req.body?.propertyId || req.query?.propertyId || "";
    if (!propertyId) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    const pid = String(propertyId).startsWith("properties/")
      ? String(propertyId).replace("properties/", "")
      : String(propertyId);

    // Minimal harmless runReport to validate access
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`;
    const body = {
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      dateRanges: [{ startDate: "2024-09-01", endDate: "2024-09-02" }],
      limit: 1,
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));

    res.status(200).json({ ok: r.ok, status: r.status, body: j });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
