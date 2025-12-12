// web/pages/api/chatgpt/v1/query.js
// GA4 query endpoint for ChatGPT users (plan-aware limits).

import { getChatGPTUserFromRequest, getGA4BearerForChatGPTUser } from "../../../../lib/server/chatgpt-auth.js";
import { withChatGPTUsageGuard, getUpgradeMessage } from "../../../../lib/server/chatgpt-usage.js";

const FREE_DATE_WINDOW_DAYS = 90;

function buildDimensionFilter(filters) {
  if (!filters || typeof filters !== "object") return null;
  const expressions = [];
  const country = String(filters?.country || "").trim();
  if (country && country !== "All") {
    expressions.push({
      filter: { fieldName: "country", stringFilter: { matchType: "EXACT", value: country, caseSensitive: false } },
    });
  }
  const channel = String(filters?.channelGroup || "").trim();
  if (channel && channel !== "All") {
    expressions.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: channel, caseSensitive: false },
      },
    });
  }
  const deviceTypeRaw = String(filters?.deviceType || "All").trim();
  const deviceType = deviceTypeRaw === "Both" ? "All" : deviceTypeRaw;
  if (deviceType && deviceType !== "All") {
    const deviceValue =
      deviceType === "Mobile" ? "mobile" : deviceType === "Desktop" ? "desktop" : deviceType.toLowerCase();
    expressions.push({
      filter: { fieldName: "deviceCategory", stringFilter: { matchType: "EXACT", value: deviceValue, caseSensitive: false } },
    });
  }
  if (!expressions.length) return null;
  return { andGroup: { expressions } };
}

function parseDateUtc(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function enforceDateRangeLimit(planKey, startDate) {
  if (planKey !== "free") return;
  const parsed = parseDateUtc(startDate);
  if (!parsed) return;
  const today = parseDateUtc(new Date().toISOString().slice(0, 10));
  const earliest = new Date(today.getTime() - (FREE_DATE_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);
  if (parsed < earliest) {
    const err = new Error(`Free plan includes data from the last ${FREE_DATE_WINDOW_DAYS} days. Upgrade for full history.`);
    err.code = "DATE_RANGE_LIMIT";
    err.status = 402;
    err.meta = { maxDays: FREE_DATE_WINDOW_DAYS, upgrade: getUpgradeMessage("free", "ga4") };
    throw err;
  }
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const user = await getChatGPTUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }
    const planKey = user.premium ? "premium" : "free";

    const { propertyId, startDate, endDate, filters = {}, limit = 50 } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ ok: false, error: "propertyId, startDate, endDate are required" });
    }

    enforceDateRangeLimit(planKey, startDate);

    const bearer = await getGA4BearerForChatGPTUser(user.chatgptUserId);

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
      ...(buildDimensionFilter(filters) ? { dimensionFilter: buildDimensionFilter(filters) } : {}),
    };

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data?.error?.message || "GA4 error" });
    }

    return res.status(200).json({ ok: true, rows: data?.rows ?? [], raw: data });
  } catch (e) {
    const msg = String(e?.message || e);
    if (e?.code === "DATE_RANGE_LIMIT") {
      return res.status(e?.status || 402).json({ ok: false, error: msg, code: e.code, limit: e.meta });
    }
    if (msg.includes("not connected") || msg.includes("connect your GA4 account")) {
      return res.status(401).json({
        ok: false,
        error: "Google Analytics not connected. Please connect your GA4 account first.",
        code: "GA4_NOT_CONNECTED",
      });
    }
    console.error("[chatgpt/v1/query] Error:", e);
    return res.status(500).json({ ok: false, error: msg });
  }
}

export default withChatGPTUsageGuard("ga4", handler);
