import { setCookie, SESSION_COOKIE_NAME } from '../../_core/cookies';
import {
  readSidFromCookie,
  popPkceVerifier,
  verifyAndDeleteState,
  setTokenRecordBySid
} from '../../_core/ga4-session';

export const config = { runtime: 'nodejs' };

function nowSec(){ return Math.floor(Date.now()/1000); }

export default async function handler(req, res) {
  try {
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`OAuth error: ${error}`);
    if (!code || !state) return res.status(400).send('Missing code or state');

    const sid = readSidFromCookie(req);
    if (!sid) return res.status(400).send('Missing or invalid SID cookie');

    const okState = await verifyAndDeleteState(sid, state);
    if (!okState) return res.status(400).send('Invalid state');

    const code_verifier = await popPkceVerifier(sid);
    if (!code_verifier) return res.status(400).send('PKCE verifier missing/expired');

    const params = new URLSearchParams();
    params.set('client_id', process.env.GOOGLE_CLIENT_ID);
    params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET);
    params.set('code', code);
    params.set('code_verifier', code_verifier);
    params.set('grant_type', 'authorization_code');
    params.set('redirect_uri', process.env.GA_OAUTH_REDIRECT);

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
    });

    const json = await resp.json().catch(()=>null);
    if (!resp.ok) {
      console.error('Token exchange failed', json);
      return res.status(400).send('Token exchange failed');
    }

    const record = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expiry: nowSec() + (json.expires_in || 3600),
      created_at: nowSec(),
    };
    if (!record.access_token || !record.refresh_token) {
      return res.status(400).send('Missing tokens from Google');
    }

    await setTokenRecordBySid(sid, record);

    // refresh cookie max-age
    const enc = req.cookies?.[SESSION_COOKIE_NAME];
    if (enc) setCookie(res, SESSION_COOKIE_NAME, enc, { maxAge: 60 * 60 * 24 * 30 });

    res.writeHead(302, { Location: '/dev/run-ga4-test' });
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send('OAuth callback failed');
  }
}
