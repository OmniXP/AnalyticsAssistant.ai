// web/pages/api/ga4/debug-session.js
import * as session from '../../lib/server/ga4-session';

export default async function handler(req, res) {
  try {
    const { token, sid } = await session.getBearerForRequest(req);
    return res.status(200).json({
      hasToken: !!token,
      sidPresent: !!sid,
      tokenStartsWith: token ? String(token).slice(0, 8) : null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'debug-session_failed', message: String(e?.message || e) });
  }
}
