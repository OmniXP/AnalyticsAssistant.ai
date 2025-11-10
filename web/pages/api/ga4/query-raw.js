// web/pages/api/ga4/query-raw.js
import { getBearerForRequest } from "../../lib/server/ga4-session.js";

/*
POST body example:
{
  "propertyId": "362732165",
  "dateRanges": [{"startDate":"2025-10-01","endDate":"2025-10-31"}],
  "metrics": [{"name":"sessions"}],
  "dimensions": [{"name":"date"}],
  "limit": 10
}
*/

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const bearer = await getBearerForRequest(req);

    const {
      propertyId,
      property,         // optional "properties/123"
      dateRanges,
      metrics,
      dimensions,
      dimensionFilter,
      metricFilter,
      orderBys,
      limit,
      offset,
      keepEmptyRows,
    } = req.body || {};

    if (!propertyId && !property) {
      return res.status(400).json({ ok: false, error: "missing_property" });
    }

    const pid = property ? property.replace(/^properties\//, "") : String(propertyId);
    const prop = `properties/${pid}`;

    const url = `https://analyticsdata.googleapis.com/v1beta/${prop}:runReport`;

    const payload = {
      dateRanges,
      metrics,
      dimensions,
      dimensionFilter,
      metricFilter,
      orderBys,
      limit: typeof limit === "number" ? limit : undefined,
      offset: typeof offset === "number" ? offset : undefined,
      keepEmptyRows: !!keepEmptyRows,
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!r.ok) {
      return res.status(500).json({ ok: false, forwarded: true, status: r.status, error: json });
    }

    return res.json({ ok: true, forwarded: true, status: r.status, report: json });
  } catch (e) {
    return res.status(200).json({ ok: false, forwarded: false, error: e.message || String(e) });
  }
}
