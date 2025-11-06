import { deleteCookie } from '../../_core/cookies';
import { readSidFromCookie, deleteTokenRecordBySid } from '../../_core/ga4-session';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const sid = readSidFromCookie(req);
    if (sid) await deleteTokenRecordBySid(sid);
    deleteCookie(res);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'disconnect failed' });
  }
}
