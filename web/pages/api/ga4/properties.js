import { getBearerForRequest } from "../../../server/ga4-session.js";
import { withUsageGuard } from "../../../server/usage-limits.js";

/**
 * Lists GA4 properties accessible to the user via Analytics Admin API.
 * Returns: { ok:true, email, properties:[{id, displayName, propertyType, account}] }
 */
async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    // Get userinfo for email
    const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const userinfo = await ui.json();

    const url = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200";
    const r = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: data?.error?.message || "Admin API error" });

    const props = [];
    for (const acc of data?.accountSummaries || []) {
      for (const p of acc?.propertySummaries || []) {
        props.push({
          id: p?.property,
          displayName: p?.displayName,
          propertyType: p?.propertyType,
          account: acc?.account,
        });
      }
    }

    return res.status(200).json({ ok: true, email: userinfo?.email ?? null, properties: props });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

export default withUsageGuard("ga4", handler, { methods: ["GET"] });
