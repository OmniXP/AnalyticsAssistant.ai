// web/pages/api/ga4/query-raw.js
import { getBearerForRequest } from "../../../server/ga4-session.js";

/**
 * Low-level proxy to GA4 runReport for debugging.
 * Body is passed straight through (propertyId + GA4 request body fields).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const { propertyId, ...rest } = req.body || {};
  if (!propertyId) {
    res.status(400).json({ ok: false, error: "Missing propertyId" });
    return;
  }

  try {
    const bearer = await getBearerForRequest(req);

    const resp = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(
        String(propertyId)
      )}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rest),
      }
    );

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg =
        json?.error?.message ||
        `Google Analytics Data API error ${resp.status}`;
      res.status(resp.status).json({ ok: false, error: msg, details: json });
      return;
    }

    res.status(200).json({ ok: true, status: 200, forwarded: true, response: json });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({
      ok: false,
      error:
        status === 401 || status === 403
          ? "No bearer"
          : e?.message || "Unexpected error",
    });
  }
}
