// web/pages/api/ga4/query-raw.js
// Low-level pass-through to GA runReport with caller-provided body.
// Body may include either `property` as "properties/{id}" or `propertyId` as "123...".

import { getBearerForRequest } from "../../../lib/server/ga4-session";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ error: "No bearer" });

    const { property, propertyId, ...rest } = req.body || {};
    const chosenProperty = property
      ? String(property).replace(/^properties\//, "")
      : propertyId
      ? String(propertyId)
      : null;

    if (!chosenProperty) return res.status(400).json({ error: "Missing property or propertyId" });

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${chosenProperty}:runReport`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(rest || {}),
    });
    const j = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 500).json(j);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
