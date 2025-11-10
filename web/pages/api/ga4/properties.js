// web/pages/api/ga4/properties.js
// Lists GA4 properties visible to the current OAuth user via the Admin API.

import { getBearerForRequest } from "../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req, res);
    if (!bearer?.access_token) {
      return res.status(401).json({ ok: false, error: "No bearer" });
    }

    // 1) List Account Summaries (each contains nested property summaries)
    const adminUrl =
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200";

    const adminResp = await fetch(adminUrl, {
      headers: { Authorization: `Bearer ${bearer.access_token}` },
    });

    if (!adminResp.ok) {
      const text = await adminResp.text();
      return res
        .status(502)
        .json({ ok: false, step: "accountSummaries", status: adminResp.status, body: text });
    }

    const adminJson = await adminResp.json();

    // 2) Flatten all property summaries
    const properties = [];
    for (const acc of adminJson.accountSummaries || []) {
      for (const ps of acc.propertySummaries || []) {
        // ps.property is like "properties/362732165"
        properties.push({
          resourceName: ps.property,
          propertyId: ps.property?.split("/")[1] || null,
          displayName: ps.displayName || null,
          account: acc.name || null, // "accounts/12345"
          accountDisplayName: acc.displayName || null,
        });
      }
    }

    return res.status(200).json({ ok: true, properties });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
