// web/lib/server/chatgpt-oauth.js
// Minimal OAuth helpers for ChatGPT Actions (auth codes, access tokens, validation).

import crypto from "crypto";
import { kvGetJson, kvSetJson } from "./ga4-session.js";

const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || process.env.CHATGPT_OAUTH_CLIENT_ID || "";
const CHATGPT_CLIENT_SECRET = process.env.CHATGPT_CLIENT_SECRET || process.env.CHATGPT_OAUTH_CLIENT_SECRET || "";
const DEFAULT_SCOPES =
  (process.env.CHATGPT_OAUTH_SCOPES || process.env.CHATGPT_SCOPES || "ga4").split(/[ ,]+/).filter(Boolean);

const AUTH_CODE_TTL = 10 * 60; // 10 minutes
const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateClient(clientId, clientSecret) {
  const okId = clientId && clientId === CHATGPT_CLIENT_ID;
  const okSecret = clientSecret && clientSecret === CHATGPT_CLIENT_SECRET;
  return okId && okSecret;
}

export function resolveScopes(scopeParam) {
  const requested = (scopeParam || "").split(/[ ,]+/).filter(Boolean);
  if (!requested.length) return DEFAULT_SCOPES;
  const invalid = requested.filter((s) => !DEFAULT_SCOPES.includes(s));
  if (invalid.length) {
    const err = new Error(`Unsupported scope: ${invalid.join(",")}`);
    err.code = "invalid_scope";
    throw err;
  }
  return requested;
}

export async function mintAuthCode(userId, scopes = DEFAULT_SCOPES, { redirectUri = null, state = null } = {}) {
  if (!userId) throw new Error("mintAuthCode: missing userId");
  const code = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + AUTH_CODE_TTL * 1000;
  await kvSetJson(
    `chatgpt_actions_code:${code}`,
    { userId, scopes, expiresAt, redirect_uri: redirectUri, state },
    AUTH_CODE_TTL
  );
  return { code, expiresAt };
}

export async function redeemAuthCode(code) {
  if (!code) return null;
  const data = await kvGetJson(`chatgpt_actions_code:${code}`);
  if (!data) return null;
  if (data.expiresAt && data.expiresAt < Date.now()) return null;
  // One-time use: expire immediately
  await kvSetJson(`chatgpt_actions_code:${code}`, null, 1);
  return data;
}

async function storeToken(token, userId, scopes, ttlSeconds, kind = "access") {
  if (!token || !userId) throw new Error("storeToken: missing token or userId");
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + ttlSeconds * 1000;
  await kvSetJson(
    `chatgpt_actions_token:${tokenHash}`,
    { userId, scopes, expiresAt, kind, tokenHash },
    ttlSeconds
  );
  return { token, expiresAt, scopes };
}

export async function mintAccessToken(userId, scopes = DEFAULT_SCOPES) {
  const token = crypto.randomBytes(32).toString("hex");
  return await storeToken(token, userId, scopes, ACCESS_TOKEN_TTL, "access");
}

export async function mintRefreshToken(userId, scopes = DEFAULT_SCOPES) {
  const token = crypto.randomBytes(40).toString("hex");
  return await storeToken(token, userId, scopes, REFRESH_TOKEN_TTL, "refresh");
}

export async function validateAccessToken(bearerToken, { allowRefresh = false } = {}) {
  if (!bearerToken) return null;
  const tokenHash = hashToken(bearerToken);
  const data = await kvGetJson(`chatgpt_actions_token:${tokenHash}`);
  if (!data) return null;
  if (data.tokenHash && !timingSafeEqual(tokenHash, data.tokenHash)) return null;
  if (data.expiresAt && data.expiresAt < Date.now()) return null;
  if (!allowRefresh && data.kind === "refresh") return null;
  return { userId: data.userId, scopes: data.scopes || DEFAULT_SCOPES, kind: data.kind || "access" };
}

export function getBearerFromAuthHeader(req) {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7).trim();
}

export function getDefaultScopesString() {
  return DEFAULT_SCOPES.join(" ");
}


