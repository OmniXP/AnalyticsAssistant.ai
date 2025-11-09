// web/pages/api/dev/query-sanity.js
// Confirms the live API sees the GA bearer token and normalises propertyId.
// HITS: GET or POST both fine.
import * as session from "../../_core/ga4-session";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { token } = await session.getBearerForRequest(req);
    const hasToken = !!token;

    let body = {};
    try {
      body = req.method === "POST" ? (typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}")) : {};
    } catch {}

    const input = (body.propertyId || body.property || "123456789").toString().trim();
    const normalised = input.startsWith("properties/") ? input : `properties/${input}`;

    return res.status(200).json({
      ok: true,
      tokenPresent: hasToken,
      inputProperty: input,
      normalisedProperty: normalised,
      hint: hasToken
        ? "Token present. If GA requests still fail, it’s metrics/dimensions or GA permissions."
        : "No token in session. OAuth likely didn’t set gaTokens cookie for this domain.",
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
