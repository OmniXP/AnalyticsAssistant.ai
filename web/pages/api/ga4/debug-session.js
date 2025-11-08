// web/pages/api/ga4/debug-session.js
// Verifies cookie → Upstash → token; pulls metadata counts so we know GA access is valid.

import * as session from '../_core/ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { sid, token } = await session.getBearerForRequest(req);
    const connected = Boolean(token);

    // Optionally check metadata if property provided
    let meta = null;
    const { property, propertyId } = req.query || {};
    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (connected && chosenProperty) {
      const url = `https://analyticsdata.googleapis.com/v1beta/${encodeURIComponent(chosenProperty)}/metadata`;
      const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      const text = await resp.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      meta = { ok: resp.ok, status: resp.status, body: json || text };
    }

    res.status(200).json({
      ok: true,
      connected,
      sidPresent: Boolean(sid),
      note: 'If connected is false, check /api/auth/google/start → consent → back here.',
      metadata: meta,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
