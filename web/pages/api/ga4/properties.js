// web/pages/api/ga4/properties.js
import * as session from '../_core/ga4-session';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const url = 'https://analyticsadmin.googleapis.com/v1alpha/accountSummaries';
    const resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });

    const text = await resp.text();
    let json = null; try { json = JSON.parse(text); } catch {}

    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'admin_error', body: json || text });
    }

    // Flatten properties with their account for convenience
    const out = (json.accountSummaries || []).flatMap(acc =>
      (acc.propertySummaries || []).map(p => ({
        account: acc.account,
        accountDisplayName: acc.displayName,
        property: p.property,
        propertyDisplayName: p.displayName,
      }))
    );

    res.status(200).json({ ok: true, properties: out });
  } catch (e) {
    res.status(500).json({ error: 'properties_exception', message: e?.message || String(e) });
  }
}
