// web/pages/api/auth/google/callback.js
// Exchanges code for tokens and sets our GA session cookie.

const crypto = require("crypto");
const { URLSearchParams } = require("url");
const { Redis } = require("@upstash/redis");
const { serializeCookie } = require("../../../../lib/cookies");

const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const APP_ENC_KEY = process.env.APP_ENC_KEY || "change_me_please_change_me_please_";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GA_OAUTH_REDIRECT;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

function b64url(buf){ return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function nowSec(){ return Math.floor(Date.now()/1000); }

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(APP_ENC_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return b64url(Buffer.concat([iv, tag, enc]));
}

async function exchangeCodeForTokens({ code, code_verifier }) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    code_verifier,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return await res.json();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).end("Method Not Allowed");
    const { code, state, error } = req.query;
    if (error) return res.status(400).send(`OAuth error: ${error}`);

    // Recover verifier from short-lived cookie
    const cookieHeader = req.headers.cookie || "";
    const ck = cookieHeader.split(";").map(s=>s.trim()).find(s=>s.startsWith("aa_pkce="));
    let verifier = null;
    if (ck) {
      try {
        const raw = decodeURIComponent(ck.split("=").slice(1).join("="));
        const obj = JSON.parse(raw);
        if (obj?.state === state) verifier = obj.verifier;
      } catch {}
    }
    if (!verifier) return res.status(400).send("Missing PKCE verifier (cookie expired). Restart connect.");

    const tokens = await exchangeCodeForTokens({ code, code_verifier: verifier });

    // Store tokens keyed by our own random sid
    const sid = b64url(crypto.randomBytes(24));
    await redis.hset(`aa:ga4:${sid}`, {
      refresh_token: tokens.refresh_token || "",
      access_token: tokens.access_token || "",
      expiry: String(nowSec() + (tokens.expires_in || 3600)),
      created_at: String(Date.now()),
    });

    // Set encrypted cookie with sid only
    const payload = JSON.stringify({ sid, ts: Date.now() });
    const enc = encrypt(payload);

    res.setHeader("Set-Cookie", [
      // GA cookie
      serializeCookie(SESSION_COOKIE_NAME, enc, {
        httpOnly: true, secure: true, sameSite: "Lax", maxAge: 1000 * 60 * 60 * 24 * 30, path: "/",
      }),
      // clear pkce helper cookie
      serializeCookie("aa_pkce", "", {
        httpOnly: true, secure: true, sameSite: "Lax", maxAge: 0, path: "/",
      }),
    ]);

    res.redirect("/?connected=ga4");
  } catch (e) {
    console.error(e);
    res.status(500).send("OAuth callback failed");
  }
}
