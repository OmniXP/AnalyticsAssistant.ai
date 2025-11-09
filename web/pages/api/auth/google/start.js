// web/pages/api/auth/google/start.js
// Starts Google OAuth with PKCE, stores code_verifier in Upstash KV against a SID.

import crypto from 'crypto';
import {
  readSidFromCookie,
  writeSidCookie,
  savePkceVerifier,
} from '../../server/ga4-session';

export const config = { runtime: 'nodejs' };

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

export default async function handler(req, res) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://app.analyticsassistant.ai/api/auth/google/callback';
    if (!clientId) return res.status(500).json({ error: 'Missing GOOGLE_CLIENT_ID' });

    // Ensure we have a SID cookie
    let sid = readSidFromCookie(req);
    if (!sid) {
      sid = crypto.randomUUID();
      writeSidCookie(res, sid);
    }

    // PKCE
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(sha256(verifier));

    await savePkceVerifier(sid, verifier);

    // Optional redirect back to your app after auth
    const desired = req.query?.redirect ? String(req.query.redirect) : (process.env.POST_AUTH_REDIRECT || '/');
    const state = b64url(JSON.stringify({ sid, redirect: desired }));

    const scope = [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.edit', // optional, keep readonly if you prefer
      'openid', 'email', 'profile',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.writeHead(302, { Location: url });
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'OAuth start failed', message: String(e?.message || e) });
  }
}
