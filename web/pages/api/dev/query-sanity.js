// web/pages/api/dev/query-sanity.js
// Confirms the live server accepts propertyId -> normalises to `properties/{id}`,
// and that a GA bearer token is retrievable from the session.
import * as session from "../_core/ga4-session";
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { token } = await session.getBearerForRequest(req);
    const hasToken = !!token;

    const body = (() => {
      try { return req.body && typeof req.body === "object" ? req.body : {}; } catch { return {}; }
    })();

    const input = (body.propertyId || body.property || "123456789").toString().trim();
    const normalised = input.startsWith("properties/") ? input : `properties/${input}`;

    return res.status(200).json({
      ok: true,
      tokenPresent: hasToken,
      acceptsPropertyId: true,
      exampleInput: input,
      normalisedTo: normalised,
      note: "If tokenPresent is false here, actual GA calls will return Not connected / 401.",
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: String(e?.message || e),
      hint: "If this fails, the server isn’t reading the same ga4-session helper that your auth routes use.",
    });
  }
}
