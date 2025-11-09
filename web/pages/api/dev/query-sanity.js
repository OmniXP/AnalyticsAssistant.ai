// web/pages/api/dev/query-sanity.js
// Confirms the active /api/ga4/query handler accepts propertyId and normalises to `properties/{id}`.

import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

    const body = req.body || {};
    const inputPropertyId = String(body.propertyId || body.property || "").trim();
    if (!inputPropertyId) return res.status(400).json({ error: "missing_property" });

    const normalised = inputPropertyId.startsWith("properties/")
      ? inputPropertyId
      : `properties/${inputPropertyId}`;

    const { token } = await getBearerForRequest(req, res);
    if (!token) return res.status(401).json({ error: "not_connected" });

    // Minimal GA request for sanity check
    const payload = {
      dateRanges: [{ startDate: "2024-09-01", endDate: "2024-09-02" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      limit: 1,
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/${encodeURIComponent(normalised)}:runReport`;
    const ga = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await ga.text();
    let json = null; try { json = JSON.parse(text); } catch {}

    return res.status(ga.ok ? 200 : ga.status).json({
      ok: ga.ok,
      normalisedProperty: normalised,
      body: json || text,
    });
  } catch (e) {
    res.status(500).json({ error: "query_sanity_exception", message: e?.message || String(e) });
  }
}
