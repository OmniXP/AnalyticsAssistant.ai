// pages/api/auth/google/status.js
// Returns { connected, access_token? } after auto-refresh.

import { getBearerForRequest } from '../../_ga4-session';
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(200).json({ connected: false });
    return res.status(200).json({ connected: true, access_token: token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ connected: false, error: 'status failed' });
  }
}
