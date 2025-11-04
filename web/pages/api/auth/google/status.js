// web/pages/api/auth/google/status.js
// Returns { connected, access_token? } by decrypting cookie then reusing Upstash record.

const { getAccessTokenFromRequest } = require("../../../../server/ga4-session");

export default async function handler(req, res) {
  try {
    const at = await getAccessTokenFromRequest(req);
    res.json({ connected: !!at, access_token: at || null });
  } catch {
    res.json({ connected: false });
  }
}
