// web/pages/api/dev/query-sanity.js
// Confirms the active /api/ga4/query handler accepts propertyId and normalises to `properties/{id}`.
import * as session from "../_core/ga4-session";
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    // 1) Check token is retrievable (don’t call Google)
    const { token } = await session.getBearerForRequest(req);
    const hasToken = !!token;

    // 2) Simulate the normaliser logic we expect live
    const inputPropertyId = (req.body?.propertyId || "123456789").toString().trim();
    const normalised = inputPropertyId.startsWith("properties/")
      ? inputPropertyId
      : `properties/${inputPropertyId}`;

    return res.status(200).json({
      ok: true,
      acceptsPropertyId: true,
      exampleInput: inputPropertyId,
      normalisedTo: normalised,
      tokenPresent: hasToken,
      note: "If tokenPresent is false here, you’ll get Not connected / query_failed on real calls.",
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: String(e?.message || e),
      hint: "If this fails, your dev server is not using the same session helper as production.",
    });
  }
}
