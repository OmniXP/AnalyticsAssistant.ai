// web/pages/api/ga4/query-raw.js
import { getBearerForRequest } from "../../../lib/server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const bearer = await getBearerForRequest(req);
    if (!bearer) return res.status(401).json({ ok: false, error: "No bearer" });

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    const { propertyId, property, ...body } = req.body || {};
    const id = propertyId || (property || "").replace(/^properties\//, "");
    if (!id) return res.status(400).json({ ok: false, error: "Missing propertyId" });

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`;
    const gaResp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
    });

    const text = await gaResp.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    res.status(200).json({
      ok: gaResp.ok,
      status: gaResp.status,
      forwarded: true,
      response: parsed || text,
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
