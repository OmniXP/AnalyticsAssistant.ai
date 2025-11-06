import { deleteCookie } from '../../_core/cookies';
import * as session from '../..//_core/ga4-session';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const sid = session.readSidFromCookie(req);
    if (sid) await session.deleteTokenRecordBySid(sid);
    deleteCookie(res);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'disconnect failed', message: e?.message || String(e) });
  }
}
