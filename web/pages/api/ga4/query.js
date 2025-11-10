// web/pages/api/ga4/query.js
// Full replacement file.
// Runs a GA4 report using the bearer resolved from the current session (aa_sid).

import { getBearerForRequest } from "../../lib/server/ga4-session.js";

// Only allow POST for safety.
function ensurePost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return false;
  }
  return true;
}

function normalisePayload(req) {
  const b = req.body || {};

  // Accept either "propertyId": "123" or "property": "properties/123"
  const rawPid = b.propertyId || b.property || "";
  const pid = String(rawPid).replace(/^properties\//, "").trim();

  const startDate = b.startDate || "30daysAgo";
  const endDate = b.endDate || "today";

  const dimensions = Array.isArray(b.dimensions) ? b.dimensions : [];
  const metrics = Array.isArray(b.metrics) ? b.metrics : [];
  const filters = b.filters || undefined; // GA4 expects an object or undefined

  if (!pid) {
    const e = new Error("Missing propertyId");
    e.code = "BAD_REQUEST";
    throw e;
  }

  return {
    propertyId: pid,
    body: {
      dateRanges: [{ startDate, endDate }],
      dimensions,
      metrics,
      dimensionFilter: filters,
    },
  };
}

export default async function handler(req, res) {
  try {
    if (!ensurePost(req, res)) return;

    // Resolve Google bearer from Upstash-backed session
    const { bearer } = await getBearerForRequest(req);

    const { propertyId, body } = normalisePayload(req);
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      res.status(r.status).json({
        error: "query_failed",
        detail: j,
      });
      return;
    }

    res.status(200).json(j);
  } catch (e) {
    // Map common session/token issues to a clean 401 for the client
    if (e.code === "NO_SESSION" || e.code === "NO_TOKENS" || e.code === "EXPIRED") {
      res.status(401).json({
        error: "no_bearer",
        message:
          'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then run again.',
      });
      return;
    }
    if (e.code === "BAD_REQUEST") {
      res.status(400).json({ error: "bad_request", message: e.message });
      return;
    }
    res.status(500).json({ error: "internal_error", message: e.message });
  }
}
