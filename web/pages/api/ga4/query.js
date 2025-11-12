// web/pages/api/ga4/query.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Returns GA4 "Default Channel Group" breakdown with sessions + users.
 * Expects: { propertyId, startDate, endDate, filters?: { country, channelGroup } }
 * Responds with raw GA4 runReport payload (dimensionHeaders/metricHeaders/rows/...).
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const {
    propertyId,
    startDate,
    endDate,
    filters = {},
    limit = 50,
  } = req.body || {};

  if (!propertyId || !startDate || !endDate) {
    res.status(400).json({ ok: false, error: "Missing propertyId or date range" });
    return;
  }

  try {
    const bearer = await getBearerForRequest(req, res);

    // Build dimensionFilter from optional filters
    const andFilter = [];
    if (filters.country && filters.country !== "All") {
      andFilter.push({
        filter: {
          fieldName: "country",
          stringFilter: { matchType: "EXACT", value: String(filters.country) },
        },
      });
    }
    if (filters.channelGroup && filters.channelGroup !== "All") {
      andFilter.push({
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) },
        },
      });
    }
    const dimensionFilter =
      andFilter.length > 0 ? { andGroup: { expressions: andFilter } } : undefined;

    const payload = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      keepEmptyRows: false,
      limit: String(limit),
      ...(dimensionFilter ? { dimensionFilter } : {}),
    };

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
        body: JSON.stringify(payload),
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

    // Return raw GA payload so the client can parse consistently.
    res.status(200).json(json);
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
