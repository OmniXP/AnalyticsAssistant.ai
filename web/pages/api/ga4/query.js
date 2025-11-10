// web/pages/api/ga4/query.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

    const { propertyId, property, dateRanges, metrics, dimensions, limit, offset, orderBys, dimensionFilter, metricFilter } = req.body || {};
    const id = propertyId || (property || "").replace(/^properties\//, "");
    if (!id) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    const payload = {
      dateRanges: dateRanges || [{ startDate: "30daysAgo", endDate: "yesterday" }],
      metrics: metrics || [{ name: "sessions" }],
      dimensions: dimensions || [{ name: "date" }],
      limit: typeof limit === "number" ? String(limit) : limit,
      offset: typeof offset === "number" ? String(offset) : offset,
      orderBys,
      dimensionFilter,
      metricFilter,
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }

    res.status(200).json({ ok: r.ok, status: r.status, response: parsed || text });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
