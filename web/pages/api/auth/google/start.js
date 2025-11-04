// web/pages/api/auth/google/start.js
// Starts Google OAuth (PKCE)

const crypto = require("crypto");
const { URLSearchParams } = require("url");

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const REDIRECT_URI = process.env.GA_OAUTH_REDIRECT;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const pkceStore = new Map(); // state -> { verifier, createdAt }
function b64url(buf) { return buf.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function sha256(input) { return crypto.createHash("sha256").update(input).digest(); }

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method Not Allowed");
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(sha256(verifier));
  pkceStore.set(state, { verifier, createdAt: Date.now() });

  // Keep in-memory store on this lambda instance
  // Pass state back in query so callback can retrieve it.
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

  // Encode state+verifier in a short-lived cookie so callback can recover if lambda instance changed
  const { serializeCookie } = await import("../../../lib/cookies");
  const stateCookie = {
    state,
    verifier,
    ts: Date.now(),
  };
  res.setHeader("Set-Cookie", serializeCookie("aa_pkce", JSON.stringify(stateCookie), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 5 * 60 * 1000, // 5 min
    path: "/",
  }));

  res.redirect(`${GOOGLE_AUTH}?${params.toString()}`);
}
