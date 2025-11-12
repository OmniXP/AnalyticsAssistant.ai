// web/pages/api/ga4/properties.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

/**
 * Lists accessible GA4 properties for the signed-in user by reading account
 * summaries and flattening property summaries.
 */
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const bearer = await getBearerForRequest(req, res);

    // Fetch account summaries
    const resp = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      { headers: { Authorization: `Bearer ${bearer}` } }
    );
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg =
        json?.error?.message ||
        `Analytics Admin API error ${resp.status}`;
      res.status(resp.status).json({ ok: false, error: msg, details: json });
      return;
    }

    const properties = [];
    for (const acc of json.accountSummaries || []) {
      for (const p of acc.propertySummaries || []) {
        properties.push({
          id: p.property?.replace("properties/", "") || "",
          displayName: p.displayName,
          parentAccount: acc.account,
        });
      }
    }

    // Optionally fetch email for display convenience
    let email = null;
    try {
      const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${bearer}` },
      }).then(r => r.json());
      email = me?.email || null;
    } catch {}

    res.status(200).json({ ok: true, email, properties });
  } catch (e) {
    const status = e?.status || 500;
    res.status(status).json({
      ok: false,
      error:
        status === 401 || status === 403
          ? "No bearer"
          : e?.message || "Unexpected error",
      properties: [],
    });
  }
}
