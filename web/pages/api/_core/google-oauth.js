// web/pages/api/_core/google-oauth.js
// Minimal Google OAuth helper: builds auth URL, stores `state` in Upstash KV,
// exchanges `code` for tokens, and retrieves the saved redirect target.

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ===== Upstash KV (state storage) ===========================================
async function kvRequest(path, init) {
  const url = process.env.UPSTASH_KV_REST_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash KV not configured (UPSTASH_KV_REST_URL / UPSTASH_KV_REST_TOKEN).");
  }
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  return res;
}

async function kvSetJSON(key, value, ttlSeconds = 600) {
  // /set/{key}/{value} with ?EX=ttl
  const payload = JSON.stringify(value);
  const res = await kvRequest(`/set/${encodeURIComponent(key)}/${encodeURIComponent(payload)}?EX=${ttlSeconds}`, {
    method: "POST",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Upstash KV set error: ${res.status} :: ${txt}`);
  }
  return true;
}

async function kvGetJSON(key) {
  const res = await kvRequest(`/get/${encodeURIComponent(key)}`, { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Upstash KV get error: ${res.status} :: ${txt}`);
  }
  const data = await res.json().catch(() => null);
  // Upstash returns { result: "<string or null>" }
  if (!data || typeof data.result === "undefined") return null;
  if (data.result == null) return null;
  try {
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

async function kvDel(key) {
  await kvRequest(`/del/${encodeURIComponent(key)}`, { method: "POST" }).catch(() => {});
}

function randomId(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// ===== Public: state helpers =================================================
export async function putAuthState(payload) {
  const id = randomId(40);
  const key = `oauth:state:${id}`;
  await kvSetJSON(key, payload || {}, 600);
  return id;
}

export async function readAuthState(id) {
  const key = `oauth:state:${id}`;
  const val = await kvGetJSON(key);
  await kvDel(key);
  return val || null;
}

// ===== Public: build Google auth URL ========================================
export function buildGoogleAuthUrl({ state, prompt = "consent", access_type = "offline", include_granted_scopes = "true" } = {}) {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI;
  if (!client_id || !redirect_uri) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI.");
  }

  // Scopes: GA4 read-only is sufficient for reports.
  const scopes = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "openid",
    "email",
    "profile",
  ].join(" ");

  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    access_type,
    include_granted_scopes,
    scope: scopes,
    prompt,
  });

  if (state) params.set("state", state);

  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

// ===== Public: exchange auth code for tokens =================================
export async function exchangeCodeForTokens(code) {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI;
  if (!client_id || !client_secret || !redirect_uri) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI.");
  }

  const body = new URLSearchParams({
    code,
    client_id,
    client_secret,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `HTTP ${resp.status}`;
    throw new Error(`Google token exchange failed: ${msg}`);
  }

  const now = Date.now();
  const expires_in = Number(json.expires_in || 0) * 1000;
  // Store an expiry a little earlier to avoid edge cases.
  const expiry_date = now + Math.max(0, expires_in - 60_000);

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token, // may be undefined if Google didn't return (already granted)
    scope: json.scope,
    token_type: json.token_type,
    expiry_date,
  };
}

// ===== Public: refresh with refresh_token ====================================
export async function refreshAccessToken(refresh_token) {
  if (!refresh_token) throw new Error("Missing refresh_token for refresh.");

  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!client_id || !client_secret) throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.");

  const body = new URLSearchParams({
    refresh_token,
    client_id,
    client_secret,
    grant_type: "refresh_token",
  });

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || `HTTP ${resp.status}`;
    throw new Error(`Google token refresh failed: ${msg}`);
  }

  const now = Date.now();
  const expires_in = Number(json.expires_in || 0) * 1000;
  const expiry_date = now + Math.max(0, expires_in - 60_000);

  return {
    access_token: json.access_token,
    refresh_token, // Google may omit refresh_token on refresh, so keep the original
    scope: json.scope,
    token_type: json.token_type,
    expiry_date,
  };
}
