// pages/api/ga4/query.js
// POST { property?: "properties/123456789", report?: {...} }
import { getBearerForRequest } from '../_core/ga4-session';
export const config = { runtime: 'nodejs' };

async function fetchJSON(res) {
  const text = await res.text();
  try { return { json: JSON.parse(text), text, ok: res.ok, status: res.status }; }
  catch { return { json: null, text, ok: res.ok, status: res.status }; }
}

async function getFirstProperty(token) {
  const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const { json, text, ok, status } = await fetchJSON(r);
  if (!ok) return { error: { where: 'accountSummaries', status, details: json || text } };
  for (const acc of (json?.accountSummaries || [])) {
    if (acc.propertySummaries?.length) return { property: acc.propertySummaries[0].property };
  }
  return { error: { where: 'accountSummaries', status: 400, details: 'No GA4 properties in account' } };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    let { property, report } = (req.body || {});
    if (!property) {
      const fp = await getFirstProperty(token);
      if (fp.error) return res.status(fp.error.status).json({ error: 'Admin API failed', ...fp.error });
      property = fp.property;
    }

    const payload = report || {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;
    const r = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const { json, text, ok, status } = await fetchJSON(r);
    if (!ok) {
      return res.status(status).json({
        error: 'Data API failed',
        status,
        propertyTried: property,
        payloadSent: payload,
        details: json || text || null,
      });
    }

    res.status(200).json({ propertyUsed: property, ...(json || { raw: text }) });
  } catch (e) {
    console.error('Query handler exception', e);
    res.status(500).json({ error: 'Query failed', message: e?.message || String(e) });
  }
}
