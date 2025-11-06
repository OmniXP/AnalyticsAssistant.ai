import { getCookie, SESSION_COOKIE_NAME, decryptSID } from '../_core/cookies';
export const config = { runtime: 'nodejs' };

export default async function handler(req,res){
  try{
    const enc = getCookie(req, SESSION_COOKIE_NAME);
    if(!enc) return res.status(200).json({ hasCookie:false });
    const sid = decryptSID(enc);
    res.status(200).json({
      ok:true,
      hasCookieHeader: !!req.headers?.cookie,
      cookieLength: (req.headers?.cookie || '').length,
      sidFound:true,
      sid,
      env:{
        nextauth:{ url: process.env.NEXTAUTH_URL, hasSecret: !!process.env.NEXTAUTH_SECRET },
        ga:{ sessionCookieName: process.env.SESSION_COOKIE_NAME, appEncKeyFingerprint: (process.env.APP_ENC_KEY||'').slice(0,8)},
        upstash:{ urlPresent: !!(process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL), tokenPresent: !!(process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN)},
        google:{ hasClientId: !!process.env.GOOGLE_CLIENT_ID, hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET, redirect: process.env.GA_OAUTH_REDIRECT }
      }
    });
  }catch(e){
    res.status(200).json({ ok:false, error:'decrypt failed' });
  }
}
