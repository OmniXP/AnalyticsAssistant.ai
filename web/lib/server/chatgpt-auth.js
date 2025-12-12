// web/lib/server/chatgpt-auth.js
// ChatGPT OAuth helpers, user resolution, and GA4 token management (isolated from web app sessions).

import prisma from "../prisma.js";
import { kvGetJson, kvSetJson } from "./ga4-session.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Extract ChatGPT bearer token from Authorization header.
 */
export function getChatGPTTokenFromRequest(req) {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7).trim();
}

/**
 * Validate ChatGPT OAuth token and return mapping data.
 * Token mappings are stored in KV at chatgpt_token:<token>.
 */
export async function validateChatGPTToken(token) {
  if (!token) return null;
  const tokenData = await kvGetJson(`chatgpt_token:${token}`);
  if (!tokenData) return null;
  if (tokenData.expires && tokenData.expires < Date.now()) return null;
  return tokenData;
}

/**
 * Find or create a User for ChatGPT.
 * - Prefer chatgptUserId match
 * - Otherwise match email (if provided) and link chatgptUserId
 * - Otherwise create placeholder email
 */
export async function getOrCreateChatGPTUser(chatgptUserId, email = null) {
  if (!chatgptUserId) throw new Error("Missing chatgptUserId");

  // 1) Try chatgptUserId
  const existing = await prisma.user.findUnique({
    where: { chatgptUserId },
    select: { id: true, email: true, premium: true, plan: true, chatgptUserId: true },
  });
  if (existing) return existing;

  const normalizedEmail = email ? email.toLowerCase() : null;

  // 2) Link to existing web user by email
  if (normalizedEmail) {
    const byEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, premium: true, plan: true, chatgptUserId: true },
    });
    if (byEmail) {
      const linked = await prisma.user.update({
        where: { id: byEmail.id },
        data: { chatgptUserId, chatgptConnectedAt: new Date() },
        select: { id: true, email: true, premium: true, plan: true, chatgptUserId: true },
      });
      return linked;
    }
  }

  // 3) Create placeholder user
  const placeholderEmail = normalizedEmail || `chatgpt_${chatgptUserId}@placeholder.local`;
  const created = await prisma.user.create({
    data: {
      email: placeholderEmail,
      chatgptUserId,
      chatgptConnectedAt: new Date(),
    },
    select: { id: true, email: true, premium: false, plan: null, chatgptUserId: true },
  });
  return created;
}

/**
 * Store ChatGPT OAuth access token -> user mapping.
 */
export async function storeChatGPTToken(token, chatgptUserId, email, userId, expiresIn = 3600) {
  if (!token || !chatgptUserId) throw new Error("Missing token or chatgptUserId");
  const expiresMs = Date.now() + expiresIn * 1000;
  await kvSetJson(
    `chatgpt_token:${token}`,
    {
      chatgptUserId,
      email: email || null,
      userId: userId || null,
      expires: expiresMs,
    },
    expiresIn
  );
}

/**
 * Resolve ChatGPT user from request Authorization header.
 */
export async function getChatGPTUserFromRequest(req) {
  const token = getChatGPTTokenFromRequest(req);
  if (!token) return null;
  const tokenData = await validateChatGPTToken(token);
  if (!tokenData?.chatgptUserId) return null;

  const user = await prisma.user.findUnique({
    where: { chatgptUserId: tokenData.chatgptUserId },
    select: { id: true, email: true, premium: true, plan: true, chatgptUserId: true },
  });
  return user;
}

/**
 * GA4 token helpers (stored separately under chatgpt_ga4_tokens:<chatgptUserId>)
 */
export async function saveGA4TokensForChatGPTUser(chatgptUserId, { access_token, refresh_token, expires_in }) {
  if (!chatgptUserId) throw new Error("Missing chatgptUserId");
  if (!access_token) throw new Error("Missing access_token");

  const now = Math.floor(Date.now() / 1000);
  const expiry = now + Math.max(30, Number(expires_in || 0) - 30);

  const prev = (await getGA4TokensForChatGPTUser(chatgptUserId)) || {};
  const tokenData = {
    access_token,
    refresh_token: refresh_token || prev.refresh_token || "",
    expiry,
  };

  // 30-day TTL to keep storage tidy
  await kvSetJson(`chatgpt_ga4_tokens:${chatgptUserId}`, tokenData, 60 * 60 * 24 * 30);
  return { ok: true };
}

export async function getGA4TokensForChatGPTUser(chatgptUserId) {
  if (!chatgptUserId) return null;
  return await kvGetJson(`chatgpt_ga4_tokens:${chatgptUserId}`);
}

export function isGA4TokenExpired(record) {
  if (!record) return true;
  const now = Math.floor(Date.now() / 1000);
  return !record.expiry || record.expiry <= now;
}

async function refreshGA4TokenForChatGPTUser(chatgptUserId) {
  const rec = await getGA4TokensForChatGPTUser(chatgptUserId);
  if (!rec || !rec.refresh_token) {
    throw new Error("Google Analytics not connected. Please connect your GA4 account first.");
  }

  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: rec.refresh_token,
    grant_type: "refresh_token",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await r.json();
  if (!r.ok) {
    throw new Error(json?.error_description || json?.error || "Failed to refresh token");
  }

  await saveGA4TokensForChatGPTUser(chatgptUserId, {
    access_token: json.access_token,
    refresh_token: rec.refresh_token, // Google may not resend
    expires_in: json.expires_in,
  });

  const latest = await getGA4TokensForChatGPTUser(chatgptUserId);
  return latest?.access_token || json.access_token;
}

/**
 * Get GA4 bearer token for ChatGPT user with auto-refresh.
 */
export async function getGA4BearerForChatGPTUser(chatgptUserId) {
  if (!chatgptUserId) throw new Error("Missing chatgptUserId");
  const rec = await getGA4TokensForChatGPTUser(chatgptUserId);
  if (!rec) {
    throw new Error("Google Analytics not connected. Please connect your GA4 account first.");
  }
  if (!isGA4TokenExpired(rec)) return rec.access_token;
  return await refreshGA4TokenForChatGPTUser(chatgptUserId);
}
