import crypto from 'crypto';
import { setCookie, encryptSID, SESSION_COOKIE_NAME } from '../../_core/cookies';
import { savePkceVerifier, saveState } from '../../_core/ga4-session';
export const config = { runtime: 'nodejs' };

function b64url(buf){ return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function sha256b64url(str){ return b64url(crypto.createHash('sha256').update(str).digest()); }

export default async function handler(req, res) {
  try {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const redirect_uri = process.env.GA_OAUTH_REDIRECT;
    if (!client_id || !redirect_uri) return res.status(500).json({ error: 'Missing Google OAuth env' });

    // Create SID and cookie
    const sid = b64url(crypto.randomBytes(24));
    const enc = encryptSID(sid);
    setCookie(res, SESSION_COOKIE_NAME, enc, { maxAge: 60*60*24*30 });

    // PKCE
    const code_verifier = b64url(crypto.randomBytes(32));
    const code_challenge = sha256b64url(code_verifier);
    await savePkceVerifier(sid, code_verifier);

    // CSRF state
    const nonce = b64url(crypto.randomBytes(16));
    await saveState(sid, nonce);

    // Build auth URL
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', client_id);
    auth.searchParams.set('redirect_uri', redirect_uri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', 'https://www.googleapis.com/auth/analytics.readonly');
    auth.searchParams.set('access_type', 'offline');
    auth.searchParams.set('prompt', 'consent');
    auth.searchParams.set('code_challenge_method', 'S256');
    auth.searchParams.set('code_challenge', code_challenge);
    auth.searchParams.set('state', nonce);

    res.writeHead(302, { Location: auth.toString() });
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'OAuth start failed' });
  }
}
