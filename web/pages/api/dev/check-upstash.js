import { readSidFromCookie, getTokenRecordBySid } from '../_core/ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(200).json({ sidFound: false, upstashRecordFound: false });

    const rec = await getTokenRecordBySid(sid);
    if (!rec) return res.status(200).json({ sidFound: true, upstashRecordFound: false });

    res.status(200).json({
      sidFound: true,
      upstashRecordFound: true,
      hasAccessTokenField: !!rec.access_token,
      hasRefreshTokenField: !!rec.refresh_token,
      expiry: rec.expiry
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'check-upstash failed' });
  }
}
