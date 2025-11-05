// web/pages/api/dev/tokeninfo.js
// Shows scopes/expiry for current access token.

import { getBearerForRequest } from '../../../server/ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(200).json({ connected: false });

    // tokeninfo is handy for debugging scopes (ok for server-side)
    const r = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    const txt = await r.text();
    let json; try { json = JSON.parse(txt); } catch { json = null; }

    return res.status(r.ok ? 200 : r.status).json({
      connected: true,
      status: r.status,
      tokeninfo: json || txt,
    });
  } catch (e) {
    return res.status(500).json({ error: 'tokeninfo failed', message: e?.message || String(e) });
  }
}
