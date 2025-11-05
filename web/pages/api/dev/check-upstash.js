// web/pages/api/dev/check-upstash.js
const { readSessionIdFromRequest, kvGet } = require("../../../server/ga4-session");

export default async function handler(req, res) {
  try {
    const sid = readSessionIdFromRequest(req);
    if (!sid) {
      return res.status(200).json({ sidFound: false, upstashRecordFound: false });
    }

    const rec = await kvGet(sid);
    res.status(200).json({
      sidFound: true,
      upstashRecordFound: !!(rec && Object.keys(rec).length),
      hasAccessTokenField: !!rec?.access_token,
      hasRefreshTokenField: !!rec?.refresh_token,
      expiry: rec?.expiry || null,
    });
  } catch (e) {
    res.status(200).json({ error: String(e?.message || e) });
  }
}
