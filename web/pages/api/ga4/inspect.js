// web/pages/api/ga4/inspect.js
import * as session from '../_core/ga4-session';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const { property, propertyId } = (req.body || {});
    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (!chosenProperty) return res.status(400).json({ error: 'No GA4 property selected or provided' });

    const url = `https://analyticsdata.googleapis.com/v1beta/${encodeURIComponent(chosenProperty)}/metadata`;
    const resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    const text = await resp.text();
    let json = null; try { json = JSON.parse(text); } catch {}

    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'metadata_failed', body: json || text });
    }

    // Trim to the fields we care about
    const dimensions = (json.dimensions || []).map(d => ({ apiName: d.apiName, customDefinition: d.customDefinition }));
    const metrics = (json.metrics || []).map(m => ({ apiName: m.apiName, type: m.type, customDefinition: m.customDefinition }));

    res.status(200).json({ ok: true, property: chosenProperty, dimensions, metrics });
  } catch (e) {
    res.status(500).json({ error: 'inspect_exception', message: e?.message || String(e) });
  }
}
