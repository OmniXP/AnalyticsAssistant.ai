// web/pages/api/auth/google/status.js
const { getAccessTokenFromRequest } = require("../../../../server/ga4-session");

export default async function handler(req, res) {
  try {
    const at = await getAccessTokenFromRequest(req);
    res.json({ connected: !!at, access_token: at || null });
  } catch {
    res.json({ connected: false });
  }
}
