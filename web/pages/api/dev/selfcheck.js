// web/pages/api/dev/selfcheck.js
import { getBearerForRequest } from '../../lib/server/ga4-session';

export default async function handler(req, res) {
  try {
    const { token, rawSid } = await getBearerForRequest(req).catch(() => ({ token: null, rawSid: null }));
    return res.status(200).json({
      up: true,
      env: {
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasSessionSecret: !!process.env.SESSION_SECRET,
      },
      session: { hasSid: !!rawSid, hasToken: !!token },
    });
  } catch (e) {
    return res.status(500).json({ error: 'selfcheck_failed', message: String(e?.message || e) });
  }
}
