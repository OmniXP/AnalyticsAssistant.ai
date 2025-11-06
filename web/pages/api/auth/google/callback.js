import { setCookie, SESSION_COOKIE_NAME } from '../../_core/cookies';
import {
  readSidFromCookie,
  popPkceVerifier,
  verifyAndDeleteState,
  setTokenRecordBySid
} from '../../_core/ga4-session';

export const config = { runtime: 'nodejs' };
function nowSec(){ return Math.floor(Date.now()/1000); }

function htmlError(title, obj) {
  const pretty = `<pre style="white-space:pre-wrap;background:#111;color:#f5f5f5;padding:12px;border-radius:8px">${JSON.stringify(obj, null, 2)}</pre>`;
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
  <div style="font-family:system-ui;max-width:900px;margin:40px auto">
    <h1>${title}</h1>
    <p>Copy the details below so we can fix the single misconfiguration.</p>
    ${pretty}
    <p><a href="/dev/run-ga4-test">Back to tester</a></p>
  </div>`;
}

export default async function handler(req, res) {
  try {
    const { code, state, error } = req.query;
    if (error) {
      res.status(400).send(htmlError('OAuth error param from Google', { error }));
      return;
    }
    if (!code || !state) {
      res.status(400).send(htmlError('Missing code or state', { code: !!code, state: !!state }));
      return;
    }

    const sid = readSidFromCookie(req);
    if (!sid) {
      res.status(400).send(htmlError('Missing or invalid SID cookie', {}));
      return;
    }

    const okState = await verifyAndDeleteState(sid, state);
    if (!okState) {
      res.status(400).send(htmlError('Invalid state (CSRF/flow restart)', { state }));
      return;
    }

    const code_verifier = await popPkceVerifier(sid);
    if (!code_verifier) {
      res.status(400).send(htmlError('Missing PKCE verifier (expired or storage issue)', {}));
      return;
    }

    const params = new URLSearchParams();
    params.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
    params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET || '');
    params.set('code', String(code));
    params.set('code_verifier', code_verifier);
    params.set('grant_type', 'authorization_code');
    params.set('redirect_uri', process.env.GA_OAUTH_REDIRECT || '');

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
    });

    const text = await resp.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    if (!resp.ok) {
      res.status(400).send(htmlError('Token exchange failed', {
        status: resp.status,
        googleResponse: json || text,
        env: {
          hasClientId: !!process.env.GOOGLE_CLIENT_ID,
          hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
          redirect: process.env.GA_OAUTH_REDIRECT || null,
        }
      }));
      return;
    }

    const record = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expiry: nowSec() + (json.expires_in || 3600),
      created_at: nowSec(),
    };
    if (!record.access_token || !record.refresh_token) {
      res.status(400).send(htmlError('Missing tokens from Google', { json }));
      return;
    }

    await setTokenRecordBySid(sid, record);

    // Refresh cookie max-age
    const enc = req.cookies?.[SESSION_COOKIE_NAME];
    if (enc) setCookie(res, SESSION_COOKIE_NAME, enc, { maxAge: 60 * 60 * 24 * 30 });

    // Success → bounce to tester
    res.writeHead(302, { Location: '/dev/run-ga4-test' });
    res.end();
  } catch (e) {
    res.status(500).send(htmlError('OAuth callback exception', { message: e?.message || String(e) }));
  }
}
