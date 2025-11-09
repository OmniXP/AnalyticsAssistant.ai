// web/pages/api/ga4/query-raw.js
//   "property": "properties/123456789",   // or "propertyId": "123456789"
import * as session from '../../lib/server/ga4-session';

export default async function handler(req, res) {
  try {
    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { property, propertyId, body } = req.body || {};
    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (!chosenProperty) return res.status(400).json({ error: 'Missing property or propertyId' });
    if (!body) return res.status(400).json({ error: 'Missing GA4 body' });

    const url = `https://analyticsdata.googleapis.com/v1beta/${encodeURIComponent(chosenProperty)}:runReport`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const text = await resp.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    if (!resp.ok) return res.status(resp.status).json({ error: 'ga4_error', body: json || text });

    return res.status(200).json(json || {});
  } catch (e) {
    return res.status(500).json({ error: 'query_raw_failed', message: String(e?.message || e) });
  }
}
