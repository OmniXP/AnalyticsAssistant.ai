// web/pages/api/dev/ga4-run-sample.js
// GET ?property=properties/123456789
// Runs a tiny report (activeUsers only) to reduce chances of payload issues.

import { getBearerForRequest } from '../../../server/ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const property = req.query.property;
    if (!property) return res.status(400).json({ error: 'Missing ?property=properties/ID' });

    const payload = {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }], // simplest possible
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const txt = await r.text();
    let json; try { json = JSON.parse(txt); } catch { json = null; }

    return res.status(r.ok ? 200 : r.status).json({
      ok: r.ok,
      status: r.status,
      propertyTried: property,
      payloadSent: payload,
      details: json || txt,
    });
  } catch (e) {
    return res.status(500).json({ error: 'run-sample failed', message: e?.message || String(e) });
  }
}
