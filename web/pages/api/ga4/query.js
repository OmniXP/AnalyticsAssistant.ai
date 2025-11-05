// web/pages/api/ga4/query.js
// Runs a GA4 Data API report using bearer from GA cookie only.
// Accepts POST body:
// { property: "properties/123456789", report: {...} }
// If no "property" provided, falls back to the first property from Admin API.

import { getBearerForRequest } from '../../../server/ga4-session';

async function getFirstProperty(token) {
  const resp = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const js = await resp.json();
  if (!resp.ok) throw new Error('Failed to fetch accountSummaries');
  for (const acc of js.accountSummaries || []) {
    if (acc.propertySummaries && acc.propertySummaries.length > 0) {
      return acc.propertySummaries[0].property; // e.g. "properties/123"
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    let { property, report } = req.body || {};

    if (!property) {
      property = await getFirstProperty(token);
      if (!property) {
        return res.status(400).json({ error: 'No GA4 property selected or available on this account' });
      }
    }

    const payload = report || {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }]
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/${encodeURIComponent(property)}:runReport`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const json = await resp.json();
    if (!resp.ok) {
      console.error('Data API error', json);
      return res.status(resp.status).json({ error: 'Data API failed', details: json });
    }
    return res.status(200).json({ propertyUsed: property, ...json });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Query failed' });
  }
}
