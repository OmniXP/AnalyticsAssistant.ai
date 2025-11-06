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
    if (!client_id || !redirect_uri) {
      return res.status(500).json({
        error: 'OAuth start failed',
        reason: 'Missing Google OAuth env',
        details: {
          hasClientId: !!client_id,
          hasRedirect: !!redirect_uri,
          expectedRedirect: 'https://app.analyticsassistant.ai/api/auth/google/callback'
        }
      });
    }
    if (!process.env.APP_ENC_KEY) {
      return res.status(500).json({
        error: 'OAuth start failed',
        reason: 'APP_ENC_KEY not set',
      });
    }

    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    if (!hasRedis && !hasKV) {
      return res.status(500).json({
        error: 'OAuth start failed',
        reason: 'No Upstash configured',
      });
    }

    const sid = b64url(crypto.randomBytes(24));
    let enc;
    try {
      enc = encryptSID(sid);
    } catch (e) {
      return res.status(500).json({
        error: 'OAuth start failed',
        reason: 'encryptSID failed',
        message: e?.message || String(e),
      });
    }
    setCookie(res, SESSION_COOKIE_NAME, enc, { maxAge: 60*60*24*30 });

    const code_verifier = b64url(crypto.randomBytes(32));
    const code_challenge = sha256b64url(code_verifier);
    try { await savePkceVerifier(sid, code_verifier); }
    catch (e) { return res.status(500).json({ error: 'OAuth start failed', reason: 'savePkceVerifier failed', message: e?.message || String(e) }); }

    const nonce = b64url(crypto.randomBytes(16));
    try { await saveState(sid, nonce); }
    catch (e) { return res.status(500).json({ error: 'OAuth start failed', reason: 'saveState failed', message: e?.message || String(e) }); }

    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', client_id);
    auth.searchParams.set('redirect_uri', redirect_uri);
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', 'https://www.googleapis.com/auth/analytics.readonly');
    auth.searchParams.set('access_type', 'offline');
    auth.searchParams.set('include_granted_scopes', 'true');
    auth.searchParams.set('prompt', 'consent');
    auth.searchParams.set('code_challenge_method', 'S256');
    auth.searchParams.set('code_challenge', code_challenge);
    auth.searchParams.set('state', nonce);

    res.writeHead(302, { Location: auth.toString() });
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'OAuth start failed', message: e?.message || String(e) });
  }
}
