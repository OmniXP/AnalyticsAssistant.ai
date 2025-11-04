// web/pages/api/ga4/properties.js
const { getAccessTokenFromRequest } = require("../../../server/ga4-session");

const ADMIN_API_SUMMARIES = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

export default async function handler(req, res) {
  try {
    const at = await getAccessTokenFromRequest(req);
    if (!at) return res.status(401).json({ error: "Not authenticated" });

    const r = await fetch(ADMIN_API_SUMMARIES, { headers: { Authorization: `Bearer ${at}` } });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: "Failed to fetch account summaries", details: text });
    }
    const data = await r.json();

    const properties = [];
    for (const acc of data.accountSummaries || []) {
      for (const p of acc.propertySummaries || []) {
        properties.push({
          accountDisplayName: acc.displayName,
          propertyDisplayName: p.displayName,
          property: p.property, // e.g. "properties/123456789"
          selected: false,
        });
      }
    }
    res.json({ properties });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Unexpected server error" });
  }
}
