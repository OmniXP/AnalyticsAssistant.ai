// pages/api/dev/ga4-admin-get.js
// GET ?property=properties/123456789 — validates GA4 property via Admin API.
import { getBearerForRequest } from '../../../server/ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const property = req.query.property;
    if (!property) return res.status(400).json({ error: 'Missing ?property=properties/ID' });

    const url = `https://analyticsadmin.googleapis.com/v1beta/${property}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const txt = await r.text();
    let json; try { json = JSON.parse(txt); } catch { json = null; }

    return res.status(r.ok ? 200 : r.status).json({
      ok: r.ok,
      status: r.status,
      propertyTried: property,
      details: json || txt,
    });
  } catch (e) {
    return res.status(500).json({ error: 'admin-get failed', message: e?.message || String(e) });
  }
}
