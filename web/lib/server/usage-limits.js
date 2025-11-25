// web/lib/server/usage-limits.js
// Centralised usage tracking, rate limiting, and premium gating helpers.

import { getServerSession } from "next-auth/next";
import prisma from "../prisma.js";
import { authOptions } from "../authOptions.js";
import { kvGetJson, kvSetJson, readSidFromCookie } from "./ga4-session.js";

const QA_PREMIUM_HEADER = "x-aa-premium-override";
const ALLOW_QA_PREMIUM_OVERRIDE =
  process.env.ALLOW_QA_PREMIUM_OVERRIDE === "true" || process.env.NODE_ENV !== "production";

export const USAGE_LIMITS = {
  free: {
    ga4ReportsPerMonth: 25,
    aiSummariesPerMonth: 10,
  },
  premium: {
    ga4ReportsPerMonth: 3000, // effectively “unlimited” with fair use
    aiSummariesPerMonth: 100,
  },
};

const PROPERTY_LIMITS = {
  free: 1,
  premium: 5,
};

const LOOKBACK_LIMIT_DAYS = {
  free: 90,
  premium: null,
};

const USAGE_PERIOD_TTL_SECONDS = 60 * 60 * 24 * 45; // keep month records for ~45 days
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CSV_DOWNLOAD_LIMIT = 3;
const CSV_WINDOW_MS = 7 * ONE_DAY_MS;
const CSV_USAGE_TTL_SECONDS = Math.ceil(CSV_WINDOW_MS / 1000) + 3600;

function hasQaPremiumOverride(req) {
  if (!ALLOW_QA_PREMIUM_OVERRIDE) return false;
  const header = req?.headers?.[QA_PREMIUM_HEADER];
  if (!header) return false;
  return header === "true" || header === "1";
}

function currentPeriodKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function getUsageIdentity(req, res) {
  let email = null;
  let userId = null;
  let premium = false;
  let plan = null;
  const qaOverride = hasQaPremiumOverride(req);

  try {
    const session = await getServerSession(req, res, authOptions);
    if (session?.user?.email) {
      email = session.user.email.toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, premium: true, plan: true },
      });
      if (user) {
        userId = user.id;
        premium = !!user.premium;
        plan = user.plan || null;
      }
    }
  } catch (err) {
    console.error("[usage-limits] getUsageIdentity failed:", err?.message || err);
  }

  if (qaOverride && !premium) {
    premium = true;
    plan = plan || "qa-premium";
  }

  if (email) return { key: `user:${email}`, premium, plan, source: "user", userId };

  const sid = readSidFromCookie(req);
  if (sid) {
    return {
      key: `sid:${sid}`,
      premium: qaOverride,
      plan: qaOverride ? "qa-premium" : null,
      source: "sid",
      userId: null,
    };
  }

  const ipRaw = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const ip = Array.isArray(ipRaw) ? ipRaw[0] : String(ipRaw).split(",")[0].trim();
  return {
    key: `ip:${ip}`,
    premium: qaOverride,
    plan: qaOverride ? "qa-premium" : null,
    source: "ip",
    userId: null,
  };
}

export async function checkAndIncrementUsage(req, res, kind) {
  const ident = await getUsageIdentity(req, res);
  const planKey = ident.premium ? "premium" : "free";
  const limits = USAGE_LIMITS[planKey];
  const period = currentPeriodKey();
  const kvKey = `usage:${ident.key}:${period}`;

  const field = kind === "ai" ? "ai_summaries_run" : "ga4_reports_run";
  const max = kind === "ai" ? limits.aiSummariesPerMonth : limits.ga4ReportsPerMonth;

  let rec = (await kvGetJson(kvKey)) || {
    period,
    key: ident.key,
    plan: planKey,
    source: ident.source,
    ga4_reports_run: 0,
    ai_summaries_run: 0,
  };

  if (rec[field] >= max) {
    const label =
      kind === "ai"
        ? planKey === "premium"
          ? "Summarise with AI PRO"
          : "Summarise with AI"
        : "GA4 reports";
    const err = new Error(`Monthly limit reached for ${label} on your ${planKey} plan.`);
    err.code = "RATE_LIMITED";
    err.status = 429;
    err.meta = { kind, plan: planKey, limit: max, period };
    err.identityKey = ident.key;
    throw err;
  }

  rec[field] += 1;
  rec.plan = planKey;
  rec.period = period;
  await kvSetJson(kvKey, rec, USAGE_PERIOD_TTL_SECONDS);

  return { identity: ident, record: rec, limits: { plan: planKey, max, period } };
}

function planKeyFromIdentity(ident) {
  return ident.premium ? "premium" : "free";
}

async function resolveIdentity(req, res) {
  if (req?.usageMeta?.identity) return req.usageMeta.identity;
  const ident = await getUsageIdentity(req, res);
  if (!req.usageMeta) req.usageMeta = {};
  req.usageMeta.identity = ident;
  return ident;
}

function propertyRecordKey(ident) {
  return `props:${ident.key}`;
}

async function getPropertyRecord(ident) {
  let rec = await kvGetJson(propertyRecordKey(ident));
  if (!rec || !Array.isArray(rec.properties)) {
    rec = { properties: [] };
  }
  return rec;
}

async function savePropertyRecord(ident, record) {
  await kvSetJson(propertyRecordKey(ident), record);
}

async function bootstrapPropertyRecord(ident, record) {
  if (record.properties.length || !ident.userId) return record;
  const user = await prisma.user.findUnique({
    where: { id: ident.userId },
    select: { ga4PropertyId: true, ga4PropertyName: true },
  });
  if (user?.ga4PropertyId) {
    record.properties.push({
      id: user.ga4PropertyId,
      name: user.ga4PropertyName || "",
      addedAt: new Date().toISOString(),
    });
    await savePropertyRecord(ident, record);
  }
  return record;
}

export async function recordPropertySelection(req, res, propertyId, metadata = {}) {
  if (!propertyId) return null;
  const ident = await resolveIdentity(req, res);
  const planKey = planKeyFromIdentity(ident);
  const limit = PROPERTY_LIMITS[planKey] ?? PROPERTY_LIMITS.free;

  let record = await getPropertyRecord(ident);
  record = await bootstrapPropertyRecord(ident, record);

  const existingIdx = record.properties.findIndex((p) => p.id === propertyId);
  if (existingIdx >= 0) {
    record.properties[existingIdx] = {
      ...record.properties[existingIdx],
      ...metadata,
      id: propertyId,
      updatedAt: new Date().toISOString(),
    };
    await savePropertyRecord(ident, record);
    return { plan: planKey, record };
  }

  if (record.properties.length >= limit) {
    const err = new Error(
      planKey === "free"
        ? "Free plan supports one GA4 property. Upgrade to Premium to connect multiple properties."
        : "Pro plan supports up to 5 GA4 properties. Remove one before adding another."
    );
    err.code = "PROPERTY_LIMIT";
    err.status = 402;
    err.meta = { plan: planKey, limit };
    throw err;
  }

  record.properties.push({
    id: propertyId,
    name: metadata?.name || "",
    addedAt: new Date().toISOString(),
  });
  await savePropertyRecord(ident, record);
  return { plan: planKey, record };
}

export async function assertPropertyAccess(req, res, propertyId) {
  if (!propertyId) return null;
  const ident = await resolveIdentity(req, res);
  let record = await getPropertyRecord(ident);
  record = await bootstrapPropertyRecord(ident, record);
  const exists = record.properties.some((p) => p.id === propertyId);
  if (!exists) {
    // Migration / first-run behaviour:
    // If this identity has no linked properties yet, treat the first successfully
    // queried property as the “linked” one instead of erroring. This preserves
    // the Free/Pro property limits while avoiding a hard break for existing users
    // who have been manually pasting the property ID.
    if (record.properties.length === 0) {
      record.properties.push({
        id: propertyId,
        name: "",
        addedAt: new Date().toISOString(),
      });
      await savePropertyRecord(ident, record);
      return { plan: planKeyFromIdentity(ident), record };
    }

    const err = new Error("This GA4 property is not linked to your account. Select it in the app first.");
    err.code = "PROPERTY_NOT_LINKED";
    err.status = 400;
    throw err;
  }
  return { plan: planKeyFromIdentity(ident), record };
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function enforceDateLimit(req, res, startDate) {
  if (!startDate) return;
  const ident = await resolveIdentity(req, res);
  const planKey = planKeyFromIdentity(ident);
  const maxDays = LOOKBACK_LIMIT_DAYS[planKey];
  if (!maxDays) return;

  const parsed = parseDate(startDate);
  if (!parsed) {
    const err = new Error("Invalid start date supplied.");
    err.code = "INVALID_DATE";
    err.status = 400;
    throw err;
  }

  const today = parseDate(new Date().toISOString().slice(0, 10));
  const earliest = new Date(today.getTime() - (maxDays - 1) * ONE_DAY_MS);
  if (parsed < earliest) {
    const err = new Error(
      `Free plan includes GA4 data from the last ${maxDays} days. Upgrade to Premium for full history.`
    );
    err.code = "DATE_RANGE_LIMIT";
    err.status = 402;
    err.meta = { maxDays };
    throw err;
  }
}

export async function enforceDataLimits(req, res, { propertyId, startDate, endDate } = {}) {
  if (propertyId) {
    await assertPropertyAccess(req, res, propertyId);
  }
  if (startDate) {
    await enforceDateLimit(req, res, startDate);
  }
  if (!startDate && endDate) {
    await enforceDateLimit(req, res, endDate);
  }
}

export async function requirePremiumUser(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    const err = new Error("Sign-in required");
    err.status = 401;
    err.code = "AUTH_REQUIRED";
    throw err;
  }
  const email = session.user.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, premium: true, plan: true, name: true },
  });
  if (!user || !user.premium) {
    const err = new Error("Premium plan required for this feature.");
    err.status = 402;
    err.code = "PREMIUM_REQUIRED";
    throw err;
  }
  return user;
}

function shouldGuard(req, methods) {
  if (!methods || methods.length === 0) return true;
  return methods.includes(req.method);
}

function sendGuardError(res, err) {
  const status = err?.status || 500;
  const payload = {
    ok: false,
    error: err?.message || "Request blocked",
  };
  if (err?.code) payload.code = err.code;
  if (err?.meta) payload.limit = err.meta;
  if (err?.details) payload.details = err.details;
  if (err?.code === "RATE_LIMITED" || err?.code === "PREMIUM_REQUIRED" || err?.code === "AUTH_REQUIRED") {
    const ident = err.identityKey ? ` identity=${err.identityKey}` : "";
    console.warn(`[usage-limits] ${err.code} -> ${payload.error}.${ident}`);
  }
  return res.status(status).json(payload);
}

export function withGuards(options = {}, handler) {
  const { usageKind = null, methods = ["POST"], requirePremium = false } = options;
  if (typeof handler !== "function") {
    throw new Error("withGuards requires a handler function as the second argument.");
  }
  return async function guardedHandler(req, res) {
    try {
      if (requirePremium) {
        const user = await requirePremiumUser(req, res);
        if (user) req.premiumUser = user;
      }
      if (usageKind && shouldGuard(req, methods)) {
        const usageResult = await checkAndIncrementUsage(req, res, usageKind);
        req.usageMeta = req.usageMeta || {};
        req.usageMeta.identity = usageResult.identity;
        req.usageMeta.usage = req.usageMeta.usage || {};
        req.usageMeta.usage[usageKind] = usageResult;
      }
    } catch (err) {
      if (err?.code === "RATE_LIMITED" || err?.code === "PREMIUM_REQUIRED" || err?.code === "AUTH_REQUIRED" || err?.status) {
        return sendGuardError(res, err);
      }
      console.error("[usage-limits] guard failure:", err);
      return res.status(500).json({ ok: false, error: "Guard failure" });
    }
    return handler(req, res);
  };
}

export function withUsageGuard(kind, handler, options = {}) {
  return withGuards({ usageKind: kind, ...options }, handler);
}

export function withPremiumGuard(handler, options = {}) {
  return withGuards({ requirePremium: true, ...options }, handler);
}

export async function assertCsvDownloadAllowance(req, res) {
  const ident = await resolveIdentity(req, res);
  const kvKey = `csv:${ident.key}`;
  const now = Date.now();
  let record = (await kvGetJson(kvKey)) || { count: 0, startedAt: now };
  if (!record.startedAt || now - record.startedAt > CSV_WINDOW_MS) {
    record = { count: 0, startedAt: now };
  }
  if (record.count >= CSV_DOWNLOAD_LIMIT) {
    const err = new Error("CSV exports are limited to 3 per week on your current plan. Upgrade for more headroom.");
    err.code = "CSV_LIMIT";
    err.status = 429;
    err.meta = { limit: CSV_DOWNLOAD_LIMIT, windowDays: 7 };
    err.identityKey = ident.key;
    throw err;
  }
  record.count += 1;
  await kvSetJson(kvKey, record, CSV_USAGE_TTL_SECONDS);
  return { remaining: Math.max(0, CSV_DOWNLOAD_LIMIT - record.count) };
}

