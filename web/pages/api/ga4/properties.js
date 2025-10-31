// /workspaces/insightsgpt/web/pages/api/ga4/properties.js
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

  if (!tok?.access_token) return res.status(401).json({ error: 'Not authenticated' });

  // Refresh if needed
  const now = Date.now();
  if (tok.expiry_date && tok.expiry_date <= now + 60_000 && tok.refresh_token) {
    const refreshed = await refreshAccessToken(tok.refresh_token);
    if (refreshed) {
      tok.access_token = refreshed.access_token;
      tok.expiry_date = now + refreshed.expires_in * 1000;
      await session.save();
    } else {
      return res.status(401).json({ error: 'Not authenticated' });
    }
  }

  // Call GA Admin API: accountSummaries -> flatten to properties
  const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${tok.access_token}` }
  });

  if (!r.ok) {
    const text = await r.text();
    return res.status(r.status).json({ error: 'Failed to fetch account summaries', details: text });
  }

  const data = await r.json();
  const properties = [];
  for (const acc of data.accountSummaries || []) {
    for (const p of acc.propertySummaries || []) {
      properties.push({
        accountDisplayName: acc.displayName,
        propertyDisplayName: p.displayName,
        property: p.property, // e.g. "properties/123456789"
        selected: false
      });
    }
  }

  res.status(200).json({ properties });
}
