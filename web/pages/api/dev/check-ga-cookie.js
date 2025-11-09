// web/pages/api/dev/check-ga-cookie.js
import { getCookie, SESSION_COOKIE_NAME, decryptSID } from '../../lib/server/cookies';

export default async function handler(req, res) {
  try {
    const raw = getCookie(req, SESSION_COOKIE_NAME);
    if (!raw) return res.status(200).json({ hasCookie: false });

    const parsed = await decryptSID(raw).catch(() => null);
    return res.status(200).json({
      hasCookie: true,
      decryptedOk: !!parsed,
      payload: parsed ? { hasGaTokens: !!parsed.gaTokens } : null,
    });
  } catch (e) {
    return res.status(500).json({ error: 'check-ga-cookie_failed', message: String(e?.message || e) });
  }
}
