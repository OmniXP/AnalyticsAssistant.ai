// web/pages/api/auth/google/disconnect.js
import { readSidFromCookie, deleteCookie } from '../../../../lib/cookies';
import { deleteTokenRecordBySid } from '../../../../server/ga4-session';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const sid = readSidFromCookie(req);
    if (sid) await deleteTokenRecordBySid(sid);
    deleteCookie(res);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'disconnect failed' });
  }
}
