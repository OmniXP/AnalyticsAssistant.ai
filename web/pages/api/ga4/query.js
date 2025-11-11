// web/pages/api/ga4/query.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

function buildDimFilter(filters = {}) {
  const exprs = [];
  if (filters.country && filters.country !== "All") {
    exprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: String(filters.country) },
      },
    });
  }
  if (filters.channelGroup && filters.channelGroup !== "All") {
    exprs.push({
      filter: {
        fieldName: "defaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: String(filters.channelGroup) },
      },
    });
  }
  if (!exprs.length) return undefined;
  return { andGroup: { expressions: exprs } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST required" });

  try {
    const { bearer, error } = await getBearerForRequest(req);
    if (error || !bearer) return res.status(401).json({ ok: false, error: error || "No bearer" });

    const { propertyId, startDate, endDate, filters } = req.body || {};
    if (!propertyId) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "defaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: "50",
      dimensionFilter: buildDimFilter(filters),
    };

    const r = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(body),
      }
    );

    const json = await r.json();
    if (!r.ok) {
      return res
        .status(r.status)
        .json({ ok: false, error: json?.error?.message || "GA4 error" });
    }

    // Return the raw GA4 runReport shape. index.js parses it via parseGa4Channels.
    return res.status(200).json(json);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
