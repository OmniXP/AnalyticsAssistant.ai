// /workspaces/insightsgpt/web/pages/api/auth/google/status.js
import { getIronSession } from 'iron-session';

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: 'aa_auth',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  }
};

async function refreshAccessToken(refresh_token) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) return null;
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const session = await getIronSession(req, res, sessionOptions);
  const tok = session.gaTokens;

  if (!tok?.access_token) return res.json({ connected: false });

  // Refresh if expiring (<= 60s buffer)
  const now = Date.now();
  if (tok.expiry_date && tok.expiry_date <= now + 60_000 && tok.refresh_token) {
    const refreshed = await refreshAccessToken(tok.refresh_token);
    if (refreshed) {
      tok.access_token = refreshed.access_token;
      tok.expiry_date = now + refreshed.expires_in * 1000;
      await session.save();
    } else {
      // refresh failed -> treat as disconnected
      return res.json({ connected: false });
    }
  }

  return res.json({ connected: true });
}
