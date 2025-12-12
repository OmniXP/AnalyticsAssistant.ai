// web/lib/server/chatgpt-usage.js
// ChatGPT-specific usage tracking, premium checks, and upgrade messaging (isolated from web app).

import { USAGE_LIMITS } from "./usage-limits.js";
import { kvGetJson, kvSetJson } from "./ga4-session.js";
import { getChatGPTUserFromRequest } from "./chatgpt-auth.js";

const USAGE_PERIOD_TTL_SECONDS = 60 * 60 * 24 * 45; // ~45 days
const PREMIUM_URL = process.env.PREMIUM_URL || process.env.NEXT_PUBLIC_PREMIUM_URL || "https://analyticsassistant.ai/premium";

function currentPeriodKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Returns upgrade messaging payload.
 */
export function getUpgradeMessage(plan, limitType) {
  const humanLimit =
    limitType === "ai"
      ? "AI summaries"
      : limitType === "ga4"
        ? "GA4 reports"
        : "feature";

  return {
    message: `You've reached your monthly ${humanLimit} limit on the Free plan.`,
    upgradeUrl: PREMIUM_URL,
    benefits: [
      "Unlimited GA4 reports",
      "100 AI summaries/month",
      "Up to 5 GA4 properties",
      "Full historical data access",
      "Advanced insights and exports",
    ],
    currentPlan: plan,
    upgradePlan: "premium",
  };
}

/**
 * Identify ChatGPT user for usage tracking.
 */
export async function getChatGPTUsageIdentity(req) {
  const user = await getChatGPTUserFromRequest(req);
  if (!user) {
    const err = new Error("ChatGPT authentication required");
    err.code = "AUTH_REQUIRED";
    err.status = 401;
    throw err;
  }

  const email = user.email ? user.email.toLowerCase() : null;
  const key = email ? `chatgpt:user:${email}` : `chatgpt:user:${user.chatgptUserId || "unknown"}`;

  return {
    key,
    premium: !!user.premium,
    plan: user.plan || (user.premium ? "premium" : "free"),
    source: "chatgpt",
    userId: user.id,
    email: email || null,
  };
}

/**
 * Check and increment usage counters for ChatGPT requests.
 */
export async function checkAndIncrementChatGPTUsage(req, kind) {
  const ident = await getChatGPTUsageIdentity(req);
  const planKey = ident.premium ? "premium" : "free";
  const limits = USAGE_LIMITS[planKey];
  const period = currentPeriodKey();
  const kvKey = `usage:${ident.key}:${period}`; // includes chatgpt prefix from key

  const field = kind === "ai" ? "ai_summaries_run" : "ga4_reports_run";
  const max = kind === "ai" ? limits.aiSummariesPerMonth : limits.ga4ReportsPerMonth;

  let rec = (await kvGetJson(kvKey)) || {
    period,
    key: ident.key,
    plan: planKey,
    source: ident.source,
    email: ident.email,
    ga4_reports_run: 0,
    ai_summaries_run: 0,
  };

  if (rec[field] >= max) {
    const upgrade = getUpgradeMessage(planKey, kind === "ai" ? "ai" : "ga4");
    const err = new Error(`Monthly limit reached for ${kind === "ai" ? "AI summaries" : "GA4 reports"} on your ${planKey} plan.`);
    err.code = "RATE_LIMITED";
    err.status = 429;
    err.meta = { kind, plan: planKey, limit: max, period, upgrade };
    err.identityKey = ident.key;
    throw err;
  }

  rec[field] += 1;
  rec.plan = planKey;
  rec.period = period;
  await kvSetJson(kvKey, rec, USAGE_PERIOD_TTL_SECONDS);

  return { identity: ident, record: rec, limits: { plan: planKey, max, period } };
}

/**
 * Require premium ChatGPT user.
 */
export async function requireChatGPTPremium(req) {
  const ident = await getChatGPTUsageIdentity(req);
  if (ident.premium) return ident;

  const err = new Error("Premium plan required for this feature.");
  err.code = "PREMIUM_REQUIRED";
  err.status = 402;
  err.meta = getUpgradeMessage("free", "premium");
  err.identityKey = ident.key;
  throw err;
}

/**
 * Guard wrapper for ChatGPT endpoints.
 */
export function withChatGPTUsageGuard(kind, handler) {
  return async function guardedHandler(req, res) {
    try {
      const usageResult = await checkAndIncrementChatGPTUsage(req, kind);
      req.chatgptUsageMeta = {
        identity: usageResult.identity,
        usage: { [kind]: usageResult },
      };
    } catch (err) {
      if (err?.code === "RATE_LIMITED" || err?.code === "AUTH_REQUIRED" || err?.code === "PREMIUM_REQUIRED") {
        return res.status(err.status || 400).json({
          ok: false,
          error: err.message,
          code: err.code,
          limit: err.meta || null,
        });
      }
      console.error("[chatgpt-usage] guard failure:", err);
      return res.status(500).json({ ok: false, error: "Usage guard failure" });
    }
    return handler(req, res);
  };
}
