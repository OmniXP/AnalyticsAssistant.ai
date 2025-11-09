// web/pages/api/auth/google/callback.js
// Completes OAuth: exchanges code with PKCE, stores tokens against SID in Upstash KV.

import {
  readSidFromCookie,
  loadPkceVerifier,
  deletePkceVerifier,
  saveTokensForSid,
} from '../../server/ga4-session';

export const config = { runtime: 'nodejs' };

function fromState(s) {
  try {
    if (!s) return {};
    const json = Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  try {
    const { code, state: stateParam, error, error_description } = req.query || {};
    if (error) return res.status(400).send(`OAuth error: ${error}: ${error_description || ''}`);
    if (!code) return res.status(400).send('Missing code');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://app.analyticsassistant.ai/api/auth/google/callback';
    if (!clientId || !clientSecret) return res.status(500).send('Google client not configured');

    const { redirect } = fromState(stateParam);

    const sid = readSidFromCookie(req);
    if (!sid) return res.status(400).send('Missing session cookie');

    const verifier = await loadPkceVerifier(sid);
    if (!verifier) return res.status(400).send('PKCE verifier not found. Restart the connection.');

    // Exchange code for tokens
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code: String(code),
      code_verifier: verifier,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok) {
      return res.status(400).json({ error: 'Token exchange failed', googleResponse: json });
    }

    // Persist tokens to Upstash (by SID), drop PKCE
    await saveTokensForSid(sid, json);
    await deletePkceVerifier(sid);

    // Send user back to the app
    const dest = redirect || process.env.POST_AUTH_REDIRECT || '/';
    res.writeHead(302, { Location: dest });
    res.end();
  } catch (e) {
    res.status(500).send(`OAuth callback failed: ${String(e?.message || e)}`);
  }
}
