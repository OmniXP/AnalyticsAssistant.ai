// web/pages/api/ga4/properties.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);

    const url = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
    const r = await fetch(url, {
      headers: { Authorization: bearer },
      cache: "no-store",
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ ok: false, error: "admin_list_failed", detail: txt });
    }

    const data = await r.json();
    const summaries = data?.accountSummaries || [];

    const properties = [];
    for (const acc of summaries) {
      for (const p of acc.propertySummaries || []) {
        properties.push({
          accountDisplayName: acc.displayName,
          property: p.property,                          // e.g. "properties/123456789"
          propertyId: p.property?.split("/")[1] || null, // e.g. "123456789"
          displayName: p.displayName,
        });
      }
    }

    return res.json({ ok: true, properties });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
