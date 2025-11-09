// web/pages/api/auth/google/start.js
import crypto from 'crypto';
import { setCookie, encryptSID, SESSION_COOKIE_NAME } from '../../_core/cookies';
import * as session from '../../_core/ga4-session';

export const config = { runtime: 'nodejs' };

function b64url(buf){ return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function sha256b64url(str){ return b64url(crypto.createHash('sha256').update(str).digest()); }

function validateRedirect(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Only allow internal paths like "/insights" (no protocol, no host)
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  // keep it short and simple
  if (raw.length > 200) return null;
  return raw;
}

export default async function handler(req, res) {
  try {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const redirect_uri = process.env.GA_OAUTH_REDIRECT;
    if (!client_id || !redirect_uri) {
      return res.status(500).json({
        error: 'OAuth start failed',
        reason: 'Missing Google OAuth env',
        details: { hasClientId: !!client_id, hasRedirect: !!redirect_uri }
      });
    }
    if (!process.env.APP_ENC_KEY) {
      return res.status(500).json({ error: 'OAuth start failed', reason: 'APP_ENC_KEY not set' });
    }

    const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!hasKV && !hasRedis) {
      return res.status(500).json({ error: 'OAuth start failed', reason: 'No Upstash configured' });
    }

    // 1) Create SID and cookie
    const sid = b64url(crypto.randomBytes(24));
    const enc = encryptSID(sid);
    setCookie(res, SESSION_COOKIE_NAME, enc, { maxAge: 60*60*24*30 });

    // 2) PKCE
    const code_verifier = b64url(crypto.randomBytes(32));
    const code_challenge = sha256b64url(code_verifier);
    await session.savePkceVerifier(sid, code_verifier);

    // 3) State = nonce | redirectPath
    const nonce = b64url(crypto.randomBytes(16));
    const requestedRedirect = validateRedirect(req.query?.redirect);
    const fallback = process.env.POST_AUTH_REDIRECT || '/';
    const redirectPath = requestedRedirect || fallback;
    const state = `${nonce}|${encodeURIComponent(redirectPath)}`;
    await session.saveState(sid, state);

    // 4) Build Google auth URL
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
    auth.searchParams.set('state', state);

    res.writeHead(302, { Location: auth.toString() });
    res.end();
  } catch (e) {
    res.status(500).json({ error: 'OAuth start failed', message: e?.message || String(e) });
  }
}
