// pages/api/ga4/properties.js
// Lists GA4 properties via accountSummaries.

import { getBearerForRequest } from '../_ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const txt = await r.text();
    let json; try { json = JSON.parse(txt); } catch { json = null; }

    if (!r.ok) return res.status(r.status).json({ error: 'Admin API failed', details: json || txt });

    const out = [];
    for (const acc of (json?.accountSummaries || [])) {
      for (const p of (acc.propertySummaries || [])) {
        out.push({
          account: acc.name,
          accountDisplayName: acc.displayName,
          property: p.property,                 // e.g. "properties/123456789"
          propertyDisplayName: p.displayName,
        });
      }
    }
    return res.status(200).json({ properties: out, raw: json });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list properties', message: e?.message || String(e) });
  }
}
