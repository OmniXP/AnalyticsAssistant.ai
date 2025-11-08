// web/pages/api/ga4/query-raw.js
// Runs a GA4 Data API request exactly as provided, so we can see the real GA error.
// POST body:
// {
//   "property": "properties/123456789",   // or "propertyId": "123456789"
//   "body": { ... }                        // full GA runReport payload
// }

import * as session from '../_core/ga4-session';
export const config = { runtime: 'nodejs' };

const GA = 'https://analyticsdata.googleapis.com/v1beta';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const { property, propertyId, body } = req.body || {};
    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (!chosenProperty) return res.status(400).json({ error: 'No GA4 property selected or provided' });
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Missing "body" (GA4 runReport payload)' });

    const url = `${GA}/${encodeURIComponent(chosenProperty)}:runReport`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const text = await resp.text();
    let json = null; try { json = JSON.parse(text); } catch {}

    // Return GA’s response as-is so we can see the exact error
    res.status(resp.status).json({
      ok: resp.ok,
      status: resp.status,
      response: json || text,
      requestEcho: { property: chosenProperty, body },
    });
  } catch (e) {
    res.status(500).json({ error: 'query_raw_exception', message: e?.message || String(e) });
  }
}
