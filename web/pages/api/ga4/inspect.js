// web/pages/api/ga4/inspect.js
import * as session from '../../lib/server/ga4-session';

export default async function handler(req, res) {
  try {
    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const { property, propertyId } = req.body || {};
    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (!chosenProperty) return res.status(400).json({ error: 'Missing property or propertyId' });

    return res.status(200).json({ ok: true, property: chosenProperty, bearer: 'present' });
  } catch (e) {
    return res.status(500).json({ error: 'inspect_failed', message: String(e?.message || e) });
  }
}
