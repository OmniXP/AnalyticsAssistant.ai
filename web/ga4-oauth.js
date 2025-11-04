// web/server/ga4-oauth.js
// Google OAuth (PKCE) + GA4 property listing, with Upstash Redis token storage.

const crypto = require("crypto");
const { URLSearchParams } = require("url");
const { Redis } = require("@upstash/redis");

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const ADMIN_API_SUMMARIES = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

// --- Env/config ---
const APP_ENC_KEY = process.env.APP_ENC_KEY || "change_me_please_change_me_please_";
const REDIRECT_URI = process.env.GA_OAUTH_REDIRECT;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";

// --- Upstash Redis env fallbacks ---
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  "";
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  "";

if (!REDIS_URL || !REDIS_TOKEN) {
  console.warn(
    "Upstash Redis env missing. Set UPSTASH_REDIS_REST_URL & ..._TOKEN (or KV_REST_API_URL & KV_REST_API_TOKEN)."
  );
}

// --- Redis (Upstash) ---
const redis = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
});

function nowSec() {
  return Math.floor(Date.now() / 1000);
}
const b64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function sha256(input) {
  return crypto.createHash("sha256").update(input).digest();
}
function randomId(len = 32) {
  return b64url(crypto.randomBytes(len));
}

// Encrypt/decrypt a tiny JSON payload for the cookie (we only store sid, not tokens)
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(APP_ENC_KEY).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return b64url(Buffer.concat([iv, tag, enc]));
}
function decrypt(payload) {
  const raw = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const key = crypto.createHash("sha256").update(APP_ENC_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

// --- PKCE ephemeral store (in-memory) ---
const pkceStore = new Map(); // state -> { verifier, createdAt }

// --- Redis helpers (sid-scoped) ---
async function kvGet(sessionId) {
  const rec = await redis.hgetall(`aa:ga4:${sessionId}`);
  return rec && Object.keys(rec).length ? rec : null;
}
async function kvSet(sessionId, data) {
  await redis.hset(`aa:ga4:${sessionId}`, data);
}
async function kvDel(sessionId) {
  await redis.del(`aa:ga4:${sessionId}`);
}

// --- OAuth helpers ---
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

async function refreshAccessToken(refresh_token) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  return await res.json();
}

async function ensureAccessToken(sessionId) {
  const rec = await kvGet(sessionId);
  if (!rec) return null;

  const now = nowSec();
  const expiry = rec.expiry ? parseInt(rec.expiry, 10) : 0;

  if (rec.access_token && expiry && expiry > now + 60) {
    return rec.access_token;
  }
  if (!rec.refresh_token) return null;

  const refreshed = await refreshAccessToken(rec.refresh_token);
  const updated = {
    refresh_token: rec.refresh_token,
    access_token: refreshed.access_token,
    expiry: String(now + (refreshed.expires_in || 3600)),
    created_at: rec.created_at || String(Date.now()),
  };
  await kvSet(sessionId, updated);
  return updated.access_token;
}

function requireSession(req) {
  const cookie = req.cookies?.[SESSION_COOKIE_NAME];
  if (!cookie) return null;
  try {
    const json = decrypt(cookie);
    const { sid } = JSON.parse(json);
    return sid || null;
  } catch {
    return null;
  }
}

module.exports = (app) => {
  // 1) Start OAuth (PKCE)
  app.get("/api/auth/google/start", (req, res) => {
    const state = randomId(24);
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(sha256(verifier));
    pkceStore.set(state, { verifier, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });

    res.redirect(`${GOOGLE_AUTH}?${params.toString()}`);
  });

  // 2) OAuth callback
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;
      if (error) return res.status(400).send(`OAuth error: ${error}`);
      const rec = pkceStore.get(state);
      if (!rec) return res.status(400).send("Invalid or expired state");
      pkceStore.delete(state);

      const tokens = await exchangeCodeForTokens({ code, code_verifier: rec.verifier });

      const sid = randomId(24);
      await kvSet(sid, {
        refresh_token: tokens.refresh_token || "",
        access_token: tokens.access_token,
        expiry: String(nowSec() + (tokens.expires_in || 3600)),
        created_at: String(Date.now()),
      });

      const payload = JSON.stringify({ sid, ts: Date.now() });
      const enc = encrypt(payload);

      res.cookie(SESSION_COOKIE_NAME, enc, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      });

      res.redirect("/?connected=ga4");
    } catch (e) {
      console.error(e);
      res.status(500).send("OAuth callback failed");
    }
  });

  // 3) Disconnect
  app.post("/api/auth/google/disconnect", async (req, res) => {
    const sid = requireSession(req);
    if (sid) await kvDel(sid);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  // 4) Status (includes access_token)
  app.get("/api/auth/google/status", async (req, res) => {
    const sid = requireSession(req);
    if (!sid) return res.json({ connected: false });
    try {
      const at = await ensureAccessToken(sid);
      res.json({ connected: !!at, access_token: at || null });
    } catch {
      res.json({ connected: false });
    }
  });

  // 5) List GA4 properties
  app.get("/api/ga4/properties", async (req, res) => {
    try {
      const sid = requireSession(req);
      if (!sid) return res.status(401).json({ error: "Not authenticated" });
      const accessToken = await ensureAccessToken(sid);
      if (!accessToken) return res.status(401).json({ error: "Not authenticated" });

      const r = await fetch(ADMIN_API_SUMMARIES, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: "Failed to fetch account summaries", details: text });
      }
      const data = await r.json();

      const properties = [];
      for (const acc of data.accountSummaries || []) {
        for (const p of acc.propertySummaries || []) {
          properties.push({
            accountDisplayName: acc.displayName,
            propertyDisplayName: p.displayName,
            property: p.property, // e.g. "properties/123456789"
            selected: false,
          });
        }
      }
      res.json({ properties });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Unexpected server error" });
    }
  });
};
