// web/pages/api/ga4/properties.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    const meResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!meResp.ok) {
      return res.status(200).json({ ok: false, error: `userinfo failed: ${meResp.status}` });
    }
    const me = await meResp.json();
    const email = me?.email;

    const listResp = await fetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      { headers: { Authorization: `Bearer ${bearer}` } }
    );

    if (!listResp.ok) {
      return res.status(200).json({ ok: false, error: `admin list failed: ${listResp.status}` });
    }

    const data = await listResp.json();
    const properties = [];
    for (const acc of data.accountSummaries || []) {
      for (const p of acc.propertySummaries || []) {
        if (!p?.property) continue;
        const id = p.property.replace(/^properties\//, "");
        properties.push({
          id,
          displayName: p.displayName,
          parentAccount: acc.account,
        });
      }
    }

    res.status(200).json({ ok: true, email: email || null, properties });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
