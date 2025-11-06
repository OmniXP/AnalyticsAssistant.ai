export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  res.status(200).json({
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GA_OAUTH_REDIRECT: process.env.GA_OAUTH_REDIRECT || null,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || null,
    APP_ENC_KEY_present: !!process.env.APP_ENC_KEY,
    KV_present: !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
    REDIS_present: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    note: 'Values are booleans for secrets; redirect printed to verify exact string.'
  });
}
