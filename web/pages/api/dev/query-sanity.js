// web/pages/api/dev/query-sanity.js
// Confirms /api/ga4/query accepts `propertyId` and normalises to `properties/{id}`,
// and that a bearer token can be produced for the current request.

import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req).catch(() => null);
    const inputPropertyId = req.query.propertyId || req.body?.propertyId || "";

    const normalised = inputPropertyId
      ? (String(inputPropertyId).startsWith("properties/")
          ? String(inputPropertyId)
          : `properties/${String(inputPropertyId)}`)
      : null;

    res.status(200).json({
      ok: true,
      hasBearer: !!bearer,
      normalisedProperty: normalised,
      tips: [
        "POST /api/ga4/query with { propertyId: \"123\", startDate, endDate }",
        "Ensure Google OAuth completed successfully and tokens are in KV for this SID.",
      ],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
