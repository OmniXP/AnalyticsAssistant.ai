// web/pages/api/ga4/query-raw.js
// Raw GA4 pass-through for debugging. You provide the GA4 body yourself.
// Body shape:
// {
//   "property": "properties/123456789"  // or use "propertyId": "123456789"
//   "gaBody": { ...exact GA4 runReport payload... }
// }

import * as session from "../../../lib/server/ga4-session";
export const config = { runtime: "nodejs" };

const GA = "https://analyticsdata.googleapis.com/v1beta";

function normaliseProperty({ property, propertyId }) {
  if (property && String(property).startsWith("properties/")) return String(property);
  if (propertyId != null && String(propertyId).trim() !== "") {
    const p = String(propertyId).trim();
    return p.startsWith("properties/") ? p : `properties/${p}`;
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed" });
    }

    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: "Not connected" });

    const { property, propertyId, gaBody } = req.body || {};
    const chosenProperty = normaliseProperty({ property, propertyId });
    if (!chosenProperty) return res.status(400).json({ error: "Missing property/propertyId" });
    if (!gaBody || typeof gaBody !== "object") return res.status(400).json({ error: "Missing gaBody" });

    const url = `${GA}/${encodeURIComponent(chosenProperty)}:runReport`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(gaBody),
      cache: "no-store",
    });

    const text = await resp.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "query_failed",
        details: json || text,
        request: { property: chosenProperty, gaBody },
      });
    }

    return res.status(200).json(json || {});
  } catch (e) {
    return res.status(500).json({ error: "query_exception", message: e?.message || String(e) });
  }
}
