// web/pages/api/ga4/query.js
// Runs a GA4 Data API report using the bearer from the GA cookie only.
// POST body:
//   { property: "properties/123456789", report: {...} }
// If "property" is omitted, it will fall back to the first property available.
//
// This version surfaces Google's error payloads verbatim to aid debugging
// and forces Node.js runtime (not Edge) to avoid environment surprises.

import { getBearerForRequest } from '../../../server/ga4-session';

export const config = {
  runtime: 'nodejs',
};

async function getFirstProperty(token) {
  const resp = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const text = await resp.text();
  let js;
  try { js = JSON.parse(text); } catch { js = null; }
  if (!resp.ok) {
    console.error('Admin API error (accountSummaries)', { status: resp.status, text });
    throw new Error(`Admin API failed (${resp.status})`);
  }
  for (const acc of (js?.accountSummaries || [])) {
    if (acc.propertySummaries?.length) {
      return acc.propertySummaries[0].property; // "properties/123"
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'POST only' });
    }

    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    let { property, report } = (req.body || {});
    if (!property) {
      property = await getFirstProperty(token);
      if (!property) {
        return res.status(400).json({ error: 'No GA4 property selected or available on this account' });
      }
    }

    const payload = report || {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
    };

    // IMPORTANT: do NOT encode the property string (it already has "properties/123")
    const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;

    const resp = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }

    if (!resp.ok) {
      // Bubble up exact details from Google so we can see the root cause
      return res.status(resp.status).json({
        error: 'Data API failed',
        status: resp.status,
        details: json || text || null,
        propertyTried: property,
        payloadSent: payload,
      });
    }

    return res.status(200).json({
      propertyUsed: property,
      ...(json || { raw: text }),
    });
  } catch (e) {
    console.error('Query handler exception', e);
    return res.status(500).json({ error: 'Query failed', message: e?.message || String(e) });
  }
}
