// web/pages/api/ga4/query-raw.js
// Thin passthrough to GA4 runReport with minimal shaping.

import { getBearerForRequest } from "../../lib/server/ga4-session.js";

function ensurePost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "method_not_allowed" });
    return false;
  }
  return true;
}

function extractPropertyId(body) {
  const raw = body.propertyId || body.property || "";
  const id = String(raw).replace(/^properties\//, "").trim();
  if (!id) {
    const e = new Error("Missing propertyId");
    e.code = "BAD_REQUEST";
    throw e;
  }
  return id;
}

export default async function handler(req, res) {
  try {
    if (!ensurePost(req, res)) return;

    const { bearer } = await getBearerForRequest(req);

    const incoming = req.body || {};
    const propertyId = extractPropertyId(incoming);
    const { property, propertyId: _pid, ...payload } = incoming;

    if (!Array.isArray(payload.dateRanges) || payload.dateRanges.length === 0) {
      payload.dateRanges = [{ startDate: "30daysAgo", endDate: "today" }];
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: bearer,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      res.status(r.status).json({ error: "query_failed", detail: j });
      return;
    }

    res.status(200).json(j);
  } catch (e) {
    if (e.code === "NO_SESSION" || e.code === "NO_TOKENS" || e.code === "EXPIRED") {
      res.status(401).json({
        error: "no_bearer",
        message:
          'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then try again.',
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
