// web/pages/api/ga4/properties.js
// Full replacement.
// Lists GA4 properties by calling the Analytics Admin API account summaries endpoint.

import { getBearerForRequest } from "../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { bearer } = await getBearerForRequest(req);

    // Fetch account summaries to enumerate properties across accounts.
    const url = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
    const r = await fetch(url, {
      headers: { Authorization: bearer },
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(r.status).json({ error: "admin_list_failed", detail: j });
      return;
    }

    const summaries = Array.isArray(j.accountSummaries) ? j.accountSummaries : [];
    const props = [];
    for (const acc of summaries) {
      const account = acc.name || "";
      const accountDisplayName = acc.displayName || "";
      const propertySummaries = Array.isArray(acc.propertySummaries) ? acc.propertySummaries : [];
      for (const p of propertySummaries) {
        const propName = p.property || ""; // e.g. "properties/123456789"
        const id = propName.replace(/^properties\//, "");
        props.push({
          id,
          property: propName,
          displayName: p.displayName || "",
          account,
          accountDisplayName,
        });
      }
    }

    res.status(200).json({ ok: true, properties: props });
  } catch (e) {
    if (e.code === "NO_SESSION" || e.code === "NO_TOKENS" || e.code === "EXPIRED") {
      res.status(401).json({
        error: "no_bearer",
        message:
          'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then try again.',
      });
      return;
    }
    res.status(500).json({ error: "internal_error", message: e.message });
  }
}
