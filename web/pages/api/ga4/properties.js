// web/pages/api/ga4/properties.js
import { getBearerForRequest } from "../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);

    // Use Account Summaries to gather GA4 properties the caller can see
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

    // Flatten property summaries into a simple array
    const properties = [];
    for (const acc of summaries) {
      for (const p of acc.propertySummaries || []) {
        // property property must be "properties/123", id is numeric
        properties.push({
          accountDisplayName: acc.displayName,
          property: p.property,
          propertyId: p.property?.split("/")[1] || null,
          displayName: p.displayName,
        });
      }
    }

    return res.json({ ok: true, properties });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
