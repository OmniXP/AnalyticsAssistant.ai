import crypto from "crypto";
import { getServerSession } from "next-auth/next";
import prisma from "../../../lib/prisma.js";
import { authOptions } from "../../../lib/authOptions.js";
import { enforceDataLimits, withUsageGuard } from "../../../server/usage-limits.js";
import { getBearerForRequest, kvGetJson, kvSetJson } from "../../../server/ga4-session.js";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://app.analyticsassistant.ai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const CONTEXT_TTL_SECONDS = 60 * 10;
const MAX_HISTORY_MESSAGES = 12;
const AUTH_FIX_URL = "/start";
const PROPERTY_FIX_URL = "/";

function readCookieValue(raw, name) {
  if (!raw || !name) return null;
  const cookies = raw.split(/;\s*/);
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  const value = match.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveUserFromSessionToken(req) {
  const raw = req.headers?.cookie || "";
  const token =
    readCookieValue(raw, "__Secure-next-auth.session-token") ||
    readCookieValue(raw, "next-auth.session-token");
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: token },
    select: {
      expires: true,
      user: { select: { id: true, email: true, ga4PropertyId: true } },
    },
  });
  if (!session?.user || !session.expires) return null;
  if (new Date(session.expires) <= new Date()) return null;
  return session.user;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseYmd(value) {
  if (!value || typeof value !== "string") return null;
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function canonicalizePropertyId(input) {
  if (!input || typeof input !== "string") return null;
  const numeric = normalizePropertyId(input);
  if (!numeric) return null;
  return `properties/${numeric}`;
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultRange() {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { startDate: formatYmd(start), endDate: formatYmd(end) };
}

function getPreviousRange({ startDate, endDate }) {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return { startDate: formatYmd(prevStart), endDate: formatYmd(prevEnd) };
}

function buildDimensionFilter(filters) {
  const expressions = [];
  const country = (filters?.country || "").trim();
  if (country && country !== "All") {
    expressions.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: country, caseSensitive: false },
      },
    });
  }
  const channel = (filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    expressions.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false },
      },
    });
  }
  const deviceTypeRaw = (filters?.deviceType || "").trim();
  const deviceType = deviceTypeRaw === "Both" ? "All" : deviceTypeRaw;
  if (deviceType && deviceType !== "All") {
    const deviceValue =
      deviceType === "Mobile" ? "mobile" : deviceType === "Desktop" ? "desktop" : deviceType.toLowerCase();
    expressions.push({
      filter: {
        fieldName: "deviceCategory",
        stringFilter: { matchType: "EXACT", value: deviceValue, caseSensitive: false },
      },
    });
  }
  if (!expressions.length) return null;
  return { andGroup: { expressions } };
}

function normalizePropertyId(input) {
  if (!input || typeof input !== "string") return null;
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {}
  if (/%2F/i.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {}
  }
  if (s.startsWith("properties/")) s = s.slice("properties/".length);
  if (!/^\d+$/.test(s)) return null;
  return s;
}

function calcDelta(current, previous) {
  const delta = current - previous;
  const deltaPct = previous === 0 ? (current === 0 ? 0 : 1) : delta / previous;
  return { delta, deltaPct };
}

async function runReport(propertyId, bearer, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || "GA4 error");
    err.status = r.status;
    throw err;
  }
  return data;
}

async function fetchTotals({ propertyId, bearer, range, filters }) {
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "engagedSessions" },
      { name: "conversions" },
      { name: "sessionConversionRate" },
      { name: "purchaseRevenue" },
    ],
    ...(buildDimensionFilter(filters) ? { dimensionFilter: buildDimensionFilter(filters) } : {}),
  };
  const data = await runReport(propertyId, bearer, body);
  const row = data?.rows?.[0]?.metricValues || [];
  return {
    sessions: toNumber(row[0]?.value),
    users: toNumber(row[1]?.value),
    engagedSessions: toNumber(row[2]?.value),
    conversions: toNumber(row[3]?.value),
    conversionRate: toNumber(row[4]?.value),
    revenue: toNumber(row[5]?.value),
  };
}

async function fetchTopChannels({ propertyId, bearer, range, filters, limit = 5 }) {
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "purchaseRevenue" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
    ...(buildDimensionFilter(filters) ? { dimensionFilter: buildDimensionFilter(filters) } : {}),
  };
  const data = await runReport(propertyId, bearer, body);
  return (data?.rows || []).map((row) => ({
    name: row?.dimensionValues?.[0]?.value || "(not set)",
    sessions: toNumber(row?.metricValues?.[0]?.value),
    conversions: toNumber(row?.metricValues?.[1]?.value),
    revenue: toNumber(row?.metricValues?.[2]?.value),
  }));
}

async function fetchTopLandingPages({ propertyId, bearer, range, filters, limit = 5 }) {
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "purchaseRevenue" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
    ...(buildDimensionFilter(filters) ? { dimensionFilter: buildDimensionFilter(filters) } : {}),
  };
  const data = await runReport(propertyId, bearer, body);
  return (data?.rows || []).map((row) => ({
    path: row?.dimensionValues?.[0]?.value || "(not set)",
    sessions: toNumber(row?.metricValues?.[0]?.value),
    conversions: toNumber(row?.metricValues?.[1]?.value),
    revenue: toNumber(row?.metricValues?.[2]?.value),
  }));
}

async function fetchTopEvents({ propertyId, bearer, range, filters, limit = 5 }) {
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    limit,
    ...(buildDimensionFilter(filters) ? { dimensionFilter: buildDimensionFilter(filters) } : {}),
  };
  const data = await runReport(propertyId, bearer, body);
  return (data?.rows || []).map((row) => ({
    name: row?.dimensionValues?.[0]?.value || "(not set)",
    count: toNumber(row?.metricValues?.[0]?.value),
  }));
}

function buildContextCacheKey({ propertyId, range, filters }) {
  const filterPayload = {
    country: filters?.country || "All",
    channelGroup: filters?.channelGroup || "All",
    deviceType: filters?.deviceType || "All",
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(filterPayload)).digest("hex").slice(0, 16);
  return `chat:context:${propertyId}:${range.startDate}:${range.endDate}:${hash}`;
}

async function buildContextPack({ propertyId, bearer, range, filters }) {
  const cacheKey = buildContextCacheKey({ propertyId, range, filters });
  const cached = await kvGetJson(cacheKey);
  if (cached) return cached;

  const previousRange = getPreviousRange(range);
  const [currentTotals, previousTotals, channels, landingPages, events] = await Promise.all([
    fetchTotals({ propertyId, bearer, range, filters }),
    previousRange ? fetchTotals({ propertyId, bearer, range: previousRange, filters }) : null,
    fetchTopChannels({ propertyId, bearer, range, filters, limit: 5 }),
    fetchTopLandingPages({ propertyId, bearer, range, filters, limit: 5 }),
    fetchTopEvents({ propertyId, bearer, range, filters, limit: 5 }),
  ]);

  const headline = {
    current: currentTotals,
    previous: previousTotals,
    deltas: previousTotals
      ? {
          sessions: calcDelta(currentTotals.sessions, previousTotals.sessions),
          users: calcDelta(currentTotals.users, previousTotals.users),
          engagedSessions: calcDelta(currentTotals.engagedSessions, previousTotals.engagedSessions),
          conversions: calcDelta(currentTotals.conversions, previousTotals.conversions),
          revenue: calcDelta(currentTotals.revenue, previousTotals.revenue),
        }
      : null,
  };

  const pack = {
    dateRange: range,
    previousRange,
    filters,
    headline,
    channels,
    landingPages,
    events,
  };
  await kvSetJson(cacheKey, pack, CONTEXT_TTL_SECONDS);
  return pack;
}

function sanitizeHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 2000),
    }))
    .filter((m) => m.content.trim().length > 0)
    .slice(-MAX_HISTORY_MESSAGES);
}

async function callOpenAI({ question, contextPack, intent, history }) {
  if (!OPENAI_API_KEY) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.status = 500;
    throw err;
  }

  const system =
    "You are an expert GA4 ecommerce analyst. Use ONLY the provided context pack. Always reference specific numbers from the context pack. If the user asks for data not in the context pack, ask one clarifying question and suggest the closest available insight you can provide.";
  const user = [
    intent === "starter" ? "Provide a concise overview first." : null,
    `Question: ${question}`,
    "Respond with:\n1) Answer in plain English\n2) What it likely means\n3) Opportunities (prioritised)\n4) Risks/Watchouts\n5) Next actions (specific tests or checks)",
  ]
    .filter(Boolean)
    .join("\n\n");

  const safeHistory = sanitizeHistory(history);
  const messages = [
    { role: "system", content: system },
    { role: "assistant", content: `Context pack (JSON): ${JSON.stringify(contextPack)}` },
    ...safeHistory,
    { role: "user", content: user },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      messages,
    }),
  });

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!res.ok) {
    const err = new Error(data?.error?.message || raw || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  try {
    const { trackOpenAIUsage } = await import("../../../lib/server/ai-tracking.js");
    await trackOpenAIUsage(OPENAI_MODEL, data?.usage);
  } catch (e) {
    console.error("[insights/chat] Failed to track AI usage:", e?.message || e);
  }

  return data?.choices?.[0]?.message?.content?.trim?.() || "";
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const session = await getServerSession(req, res, authOptions);
    let user = null;
    if (session?.user?.email) {
      user = await prisma.user.findUnique({
        where: { email: session.user.email.toLowerCase() },
        select: { id: true, email: true, ga4PropertyId: true },
      });
    }
    if (!user) {
      // Fallback when NextAuth session isn't resolved, but a session token cookie exists.
      // This prevents post-OAuth cookie edge cases from hard-blocking chat requests.
      user = await resolveUserFromSessionToken(req);
    }
    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
        code: "AUTH_REQUIRED",
        fixUrl: AUTH_FIX_URL,
        message: "Please sign in to use Analytics Chat.",
      });
    }

    const { threadId, message, dateRange, filters, intent, propertyId: bodyPropertyId } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ ok: false, error: "Missing message" });
    }

    let thread = null;
    let threadPropertyId = user.ga4PropertyId || null;
    const bodyPropertyCanonical = canonicalizePropertyId(bodyPropertyId);
    let history = [];
    if (threadId) {
      thread = await prisma.chatThread.findFirst({
        where: { id: String(threadId), userId: user.id },
        select: { id: true, ga4PropertyId: true },
      });
      if (!thread) {
        return res.status(404).json({ ok: false, error: "Thread not found" });
      }
      threadPropertyId = thread.ga4PropertyId || threadPropertyId;
      history = await prisma.chatMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "desc" },
        take: MAX_HISTORY_MESSAGES,
        select: { role: true, content: true },
      });
      history = history.reverse();
    }

    const effectivePropertyId = bodyPropertyCanonical || threadPropertyId;
    if (!effectivePropertyId) {
      return res.status(400).json({
        ok: false,
        code: "PROPERTY_REQUIRED",
        message: "Select a default GA4 property in AnalyticsAssistant.ai before using chat.",
        fixUrl: new URL("/onboard", APP_ORIGIN).toString(),
      });
    }

    const range = dateRange?.startDate && dateRange?.endDate ? dateRange : getDefaultRange();
    const safeFilters = filters || { country: "All", channelGroup: "All", deviceType: "All" };

    await enforceDataLimits(req, res, {
      propertyId: effectivePropertyId,
      startDate: range.startDate,
      endDate: range.endDate,
    });

    const propertyIdNumeric = normalizePropertyId(effectivePropertyId);
    if (!propertyIdNumeric) {
      return res.status(400).json({ ok: false, error: "Invalid GA4 property ID", code: "PROPERTY_REQUIRED" });
    }

    const bearer = await getBearerForRequest(req);
    if (!bearer) {
      return res.status(401).json({ ok: false, error: "No GA4 bearer", code: "AUTH_REQUIRED" });
    }

    const contextPack = await buildContextPack({
      propertyId: propertyIdNumeric,
      bearer,
      range,
      filters: safeFilters,
    });

    const assistantMessage = await callOpenAI({
      question: message.trim(),
      contextPack,
      intent,
      history,
    });

    const now = new Date();
    let resolvedThreadId = thread?.id || null;
    await prisma.$transaction(async (tx) => {
      if (!resolvedThreadId) {
        const created = await tx.chatThread.create({
          data: {
            userId: user.id,
            ga4PropertyId: effectivePropertyId,
            title: message.trim().slice(0, 80) || null,
          },
          select: { id: true },
        });
        resolvedThreadId = created.id;
      } else {
        await tx.chatThread.update({
          where: { id: resolvedThreadId },
          data: { updatedAt: now, ga4PropertyId: effectivePropertyId },
        });
      }

      await tx.chatMessage.createMany({
        data: [
          { threadId: resolvedThreadId, role: "user", content: message.trim() },
          { threadId: resolvedThreadId, role: "assistant", content: assistantMessage },
        ],
      });
    });

    const usage = req.usageMeta?.usage?.chat;
    const remainingQuota = usage?.limits?.plan === "free" ? usage.limits.remaining : undefined;

    return res.status(200).json({
      threadId: resolvedThreadId,
      assistantMessage,
      ...(remainingQuota != null ? { remainingQuota } : {}),
    });
  } catch (e) {
    if (e?.code === "PROPERTY_NOT_LINKED") {
      return res.status(400).json({
        ok: false,
        code: "PROPERTY_NOT_LINKED",
        message: e.message,
        fixUrl: PROPERTY_FIX_URL,
      });
    }
    if (e?.code === "DATE_RANGE_LIMIT") {
      return res.status(402).json({ ok: false, code: "DATE_RANGE_LIMIT", message: e.message });
    }
    const status = e?.status || 500;
    return res.status(status).json({ ok: false, error: e?.message || "Chat failed" });
  }
}

export default withUsageGuard("chat", handler);
