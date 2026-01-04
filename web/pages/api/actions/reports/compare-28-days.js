import prisma from "../../../../lib/prisma.js";
import { getBearerForUser, getBearerForEmail, kvGetJson, kvSetJson } from "../../../../lib/server/ga4-session.js";
import { USAGE_LIMITS } from "../../../../lib/server/usage-limits.js";
import { getBearerFromAuthHeader, validateAccessToken } from "../../../../lib/server/chatgpt-oauth.js";

function normalisePropertyId(input) {
  if (!input || typeof input !== "string") return null;
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {}
  // In case it was double-encoded (e.g., properties%252F123), decode one more time if a % remains.
  if (/%2F/i.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {}
  }
  s = s.trim();
  if (s.startsWith("properties/")) s = s.slice("properties/".length);
  if (!/^\d+$/.test(s)) return null;
  return s;
}

const USAGE_PERIOD_TTL_SECONDS = 60 * 60 * 24 * 45;

function currentPeriodKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcDelta(current, previous) {
  const delta = current - previous;
  const deltaPct = previous === 0 ? (current === 0 ? 0 : 1) : delta / previous;
  return { delta, deltaPct };
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "Unauthorized", code: "AUTH_REQUIRED" });
}

async function enforceUsage(user) {
  const planKey = user?.premium ? "premium" : "free";
  const limits = USAGE_LIMITS[planKey] || USAGE_LIMITS.free;
  const period = currentPeriodKey();
  const keyBase = user?.email ? `user:${user.email.toLowerCase()}` : `userId:${user?.id || "unknown"}`;
  const kvKey = `usage:${keyBase}:${period}`;

  let rec = (await kvGetJson(kvKey)) || {
    period,
    key: keyBase,
    plan: planKey,
    source: "chatgpt-actions",
    ga4_reports_run: 0,
    ai_summaries_run: 0,
  };

  if (rec.ga4_reports_run >= limits.ga4ReportsPerMonth) {
    const err = new Error("Monthly limit reached for GA4 reports on your current plan.");
    err.code = "RATE_LIMITED";
    err.status = 429;
    err.meta = { plan: planKey, limit: limits.ga4ReportsPerMonth, period };
    throw err;
  }

  rec.ga4_reports_run += 1;
  rec.plan = planKey;
  rec.period = period;
  await kvSetJson(kvKey, rec, USAGE_PERIOD_TTL_SECONDS);
}

function buildRanges() {
  const today = new Date();
  const endCurrent = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const startCurrent = new Date(endCurrent);
  startCurrent.setUTCDate(startCurrent.getUTCDate() - 27);

  const endPrevious = new Date(startCurrent);
  endPrevious.setUTCDate(endPrevious.getUTCDate() - 1);
  const startPrevious = new Date(endPrevious);
  startPrevious.setUTCDate(startPrevious.getUTCDate() - 27);

  const fmt = (d) => d.toISOString().slice(0, 10);
  return {
    current: { start: fmt(startCurrent), end: fmt(endCurrent) },
    previous: { start: fmt(startPrevious), end: fmt(endPrevious) },
  };
}

async function runReport(propertyId, bearer, body) {
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message || "GA4 error";
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data;
}

async function fetchTotals(propertyId, bearer, range) {
  const body = {
    dateRanges: [{ startDate: range.start, endDate: range.end }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "engagedSessions" },
      { name: "engagementRate" },
      { name: "conversions" },
      { name: "sessionConversionRate" },
    ],
  };
  const data = await runReport(propertyId, bearer, body);
  const row = data?.rows?.[0]?.metricValues || [];
  return {
    sessions: toNumber(row[0]?.value),
    users: toNumber(row[1]?.value),
    engagedSessions: toNumber(row[2]?.value),
    engagementRate: toNumber(row[3]?.value),
    conversions: toNumber(row[4]?.value),
    conversionRate: toNumber(row[5]?.value),
  };
}

function mapDimensionRows(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const name = row.dimensionValues?.[0]?.value || "(not set)";
    const metrics = row.metricValues || [];
    map.set(name, {
      sessions: toNumber(metrics[0]?.value),
      conversions: toNumber(metrics[1]?.value),
    });
  });
  return map;
}

async function fetchDimensionDelta(propertyId, bearer, rangeCurrent, rangePrevious, dimension, limit = 5) {
  const baseBody = {
    dimensions: [{ name: dimension }],
    metrics: [{ name: "sessions" }, { name: "conversions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: Math.max(10, limit * 2),
  };

  const [currentData, previousData] = await Promise.all([
    runReport(propertyId, bearer, { ...baseBody, dateRanges: [{ startDate: rangeCurrent.start, endDate: rangeCurrent.end }] }),
    runReport(propertyId, bearer, { ...baseBody, dateRanges: [{ startDate: rangePrevious.start, endDate: rangePrevious.end }] }),
  ]);

  const currentMap = mapDimensionRows(currentData?.rows);
  const previousMap = mapDimensionRows(previousData?.rows);

  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const merged = [];
  keys.forEach((key) => {
    const current = currentMap.get(key) || { sessions: 0, conversions: 0 };
    const previous = previousMap.get(key) || { sessions: 0, conversions: 0 };
    const sessionDelta = calcDelta(current.sessions, previous.sessions);
    const convDelta = calcDelta(current.conversions, previous.conversions);
    merged.push({
      name: key,
      current,
      previous,
      delta: sessionDelta.delta,
      deltaPct: sessionDelta.deltaPct,
      conversionsDelta: convDelta.delta,
      conversionsDeltaPct: convDelta.deltaPct,
    });
  });

  merged.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return merged.slice(0, limit);
}

function buildHeadline(metrics) {
  const sessions = metrics.find((m) => m.name === "Sessions");
  const conversions = metrics.find((m) => m.name === "Conversions");
  const sPct = sessions ? Math.round((sessions.deltaPct || 0) * 100) : 0;
  const cPct = conversions ? Math.round((conversions.deltaPct || 0) * 100) : 0;
  return `Sessions ${sPct >= 0 ? "up" : "down"} ${Math.abs(sPct)}%, conversions ${cPct >= 0 ? "up" : "down"} ${Math.abs(cPct)}% vs previous 28 days.`;
}

function buildRecommendations(biggestChange, drivers) {
  const recs = [];
  if (biggestChange?.metric === "Conversions" && biggestChange.direction === "down") {
    recs.push({
      priority: 1,
      title: "Stabilise conversion drop",
      why: "Conversions dipped the most vs last period.",
      how: "Check top landing pages for tracking changes, validate forms, and run a quick funnel QA on the top traffic channel.",
    });
  }

  if ((drivers?.channels || []).length) {
    const top = drivers.channels[0];
    recs.push({
      priority: recs.length + 1,
      title: `Lean into ${top.name}`,
      why: `${top.name} shows the biggest session delta (${Math.round((top.deltaPct || 0) * 100)}%).`,
      how: "Shift budget/effort toward this channel while monitoring engaged sessions and conversion rate for the next week.",
    });
  }

  recs.push({
    priority: recs.length + 1,
    title: "Validate analytics freshness",
    why: "Ensures Actions summaries stay trustworthy.",
    how: "Confirm GA4 connection is active and events are flowing; rerun this report after any tagging or site changes.",
  });

  return recs.slice(0, 3);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers?.authorization || "";
    console.log("[actions] auth_header_present", { hasAuthHeader: !!authHeader });

    let mode = "web";
    let email = null;
    let tokenData = null;

    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1] || "";
      const chatgptToken = await kvGetJson(`chatgpt:oauth:token:${token}`);
      if (!chatgptToken?.email) {
        return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
      }
      mode = "chatgpt";
      email = chatgptToken.email;
      console.log("[actions] auth", { mode, emailPresent: !!email });
    } else {
      const bearerHeader = getBearerFromAuthHeader(req);
      tokenData = await validateAccessToken(bearerHeader);
      if (!tokenData?.userId) return unauthorized(res);
      mode = "web";
      console.log("[actions] auth", { mode, emailPresent: false });
    }

    const user = await prisma.user.findUnique({
      where: mode === "chatgpt" ? { email: email?.toLowerCase?.() || email } : { id: tokenData.userId },
      select: {
        id: true,
        email: true,
        premium: true,
        plan: true,
        ga4PropertyId: true,
        ga4PropertyName: true,
      },
    });
    if (!user) return unauthorized(res);

    const { propertyId: bodyPropertyId } = req.body || {};
    const rawPropertyId = bodyPropertyId || user.ga4PropertyId;
    const numericPropertyId = normalisePropertyId(rawPropertyId);
    if (mode === "chatgpt") {
      console.log("[actions] property normalised", { raw: rawPropertyId, numeric: numericPropertyId });
    }
    const hasDefaultProperty = !!numericPropertyId;
    if (mode === "chatgpt") {
      console.log("[actions] default property", {
        email: user.email || email || null,
        ga4PropertyId: !!user.ga4PropertyId,
      });
    }
    if (!numericPropertyId) {
      console.log("[actions] auth_required", {
        email: user.email || email || null,
        hasUserGa4Tokens: false,
        hasDefaultProperty,
        connectUrl: "https://app.analyticsassistant.ai/start?source=chatgpt",
      });
      return res.status(401).json({
        ok: false,
        error: "AUTH_REQUIRED",
        hint: "MISSING_DEFAULT_PROPERTY",
        connectUrl: "https://app.analyticsassistant.ai/connections?source=chatgpt",
      });
    }

    await enforceUsage(user);

    const range = buildRanges();
    let bearer = null;
    try {
      if (mode === "chatgpt") {
        const ga4Tokens = await kvGetJson(`ga4:user:${(user.email || email || "").toLowerCase()}`);
        const hasUserGa4Tokens = !!ga4Tokens;
        console.log("[actions] user token lookup", {
          email: user.email || email || null,
          key: `ga4:user:${(user.email || email || "").toLowerCase()}`,
          found: !!ga4Tokens,
          hasAccess: !!ga4Tokens?.access_token,
          hasRefresh: !!ga4Tokens?.refresh_token,
          keys: ga4Tokens ? Object.keys(ga4Tokens) : null,
        });
        if (!ga4Tokens) {
          console.log("[actions] auth_required", {
            email: user.email || email || null,
            hasUserGa4Tokens,
            hasDefaultProperty,
            connectUrl: "https://app.analyticsassistant.ai/connections?source=chatgpt",
          });
          return res.status(401).json({
            ok: false,
            error: "AUTH_REQUIRED",
            hint: "MISSING_GA4_USER_TOKENS",
            connectUrl: "https://app.analyticsassistant.ai/connections?source=chatgpt",
          });
        }
        // Mint GA4 bearer via existing refresh logic (email-based)
        bearer = await getBearerForEmail(user.email);
      } else {
        bearer = await getBearerForUser(user.id);
      }
    } catch (e) {
      bearer = null;
    }
    if (!bearer) {
      console.log("[actions] auth_required", {
        email: user.email || email || null,
        hasUserGa4Tokens: false,
        hasDefaultProperty,
        connectUrl: "https://app.analyticsassistant.ai/connections?source=chatgpt",
      });
      return res.status(401).json({
        ok: false,
        error: "AUTH_REQUIRED",
        hint: "MISSING_GA4_USER_TOKENS",
        connectUrl: "https://app.analyticsassistant.ai/connections?source=chatgpt",
      });
    }

    const ga4Property = `properties/${numericPropertyId}`;
    const [currentTotals, previousTotals, channels, landingPages, devices] = await Promise.all([
      fetchTotals(ga4Property, bearer, range.current),
      fetchTotals(ga4Property, bearer, range.previous),
      fetchDimensionDelta(ga4Property, bearer, range.current, range.previous, "sessionDefaultChannelGroup", 5),
      fetchDimensionDelta(ga4Property, bearer, range.current, range.previous, "landingPagePlusQueryString", 5),
      fetchDimensionDelta(ga4Property, bearer, range.current, range.previous, "deviceCategory", 3),
    ]);

    const metrics = [
      (() => {
        const { delta, deltaPct } = calcDelta(currentTotals.sessions, previousTotals.sessions);
        return { name: "Sessions", current: currentTotals.sessions, previous: previousTotals.sessions, delta, deltaPct };
      })(),
      (() => {
        const { delta, deltaPct } = calcDelta(currentTotals.users, previousTotals.users);
        return { name: "Users", current: currentTotals.users, previous: previousTotals.users, delta, deltaPct };
      })(),
      (() => {
        const { delta, deltaPct } = calcDelta(currentTotals.engagedSessions, previousTotals.engagedSessions);
        return {
          name: "Engaged Sessions",
          current: currentTotals.engagedSessions,
          previous: previousTotals.engagedSessions,
          delta,
          deltaPct,
        };
      })(),
      (() => {
        const { delta, deltaPct } = calcDelta(currentTotals.engagementRate, previousTotals.engagementRate);
        return {
          name: "Engagement Rate",
          current: currentTotals.engagementRate,
          previous: previousTotals.engagementRate,
          delta,
          deltaPct,
        };
      })(),
      (() => {
        const { delta, deltaPct } = calcDelta(currentTotals.conversions, previousTotals.conversions);
        return {
          name: "Conversions",
          current: currentTotals.conversions,
          previous: previousTotals.conversions,
          delta,
          deltaPct,
        };
      })(),
      (() => {
        const { delta, deltaPct } = calcDelta(currentTotals.conversionRate, previousTotals.conversionRate);
        return {
          name: "Conversion Rate",
          current: currentTotals.conversionRate,
          previous: previousTotals.conversionRate,
          delta,
          deltaPct,
        };
      })(),
    ];

    const biggestChange = metrics.reduce(
      (acc, m) => {
        const magnitude = Math.abs(m.deltaPct || 0);
        if (magnitude > acc.magnitude) {
          return { metric: m.name, deltaPct: m.deltaPct || 0, direction: (m.deltaPct || 0) >= 0 ? "up" : "down", magnitude };
        }
        return acc;
      },
      { metric: null, deltaPct: 0, direction: "flat", magnitude: 0 }
    );

    const drivers = {
      channels,
      landingPages,
      devices,
    };

    const response = {
      ok: true,
      range,
      headline: buildHeadline(metrics),
      metrics,
      biggestChange: { metric: biggestChange.metric, deltaPct: biggestChange.deltaPct, direction: biggestChange.direction },
      drivers,
      recommendedActions: buildRecommendations(biggestChange, drivers),
    };

    return res.status(200).json(response);
  } catch (e) {
    const msg = String(e?.message || e);
    if (e?.code === "RATE_LIMITED") {
      return res.status(e.status || 429).json({ ok: false, error: msg, code: e.code, limit: e.meta });
    }
    if (msg.includes("Google session expired") || msg.includes("No refresh token") || msg.includes("Google Analytics not connected")) {
      return res.status(401).json({
        ok: false,
        error: "Google Analytics not connected. Reconnect GA4 in AnalyticsAssistant.ai.",
        code: "GA4_NOT_CONNECTED",
      });
    }
    console.error("[actions/compare-28-days] Error:", e);
    return res.status(e.status || 500).json({ ok: false, error: msg });
  }
}

