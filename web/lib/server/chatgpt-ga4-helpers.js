// web/lib/server/chatgpt-ga4-helpers.js
// Helper functions for ChatGPT GA4 queries with caching and auto-fetching.

import { getGA4BearerForConnection, getGA4TokensForConnection, isGA4TokenExpired } from "./chatgpt-auth.js";
import { kvGetJson, kvSetJson } from "./ga4-session.js";
import { DEFAULT_GA4_QUERY } from "./chatgpt-config.js";

/**
 * Check if GA4 is connected for a connectionId.
 */
export async function isGA4Connected(connectionId) {
  if (!connectionId) return false;
  const tokens = await getGA4TokensForConnection(connectionId);
  return !!tokens && !isGA4TokenExpired(tokens);
}

/**
 * Fetch GA4 default 28-day comparison report.
 * Returns cached data if available, otherwise fetches fresh.
 */
export async function fetchDefaultGA4Report(connectionId, propertyId) {
  if (!connectionId || !propertyId) {
    throw new Error("Missing connectionId or propertyId");
  }

  // Check cache first
  const cacheKey = `chatgpt_ga4_summary:${connectionId}:${propertyId}`;
  const cached = await kvGetJson(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Fetch fresh data
  const bearer = await getGA4BearerForConnection(connectionId);
  
  // Calculate date ranges (last 28 days vs previous 28 days)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - 28);
  
  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);
  
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - 28);

  const formatDate = (d) => d.toISOString().split("T")[0];

  // Fetch current period data
  const currentQuery = {
    dateRanges: [{ startDate: formatDate(currentStart), endDate: formatDate(yesterday) }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "purchases" },
      { name: "purchaseRevenue" },
      { name: "averagePurchaseRevenue" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 10,
  };

  // Fetch previous period data
  const previousQuery = {
    dateRanges: [{ startDate: formatDate(previousStart), endDate: formatDate(previousEnd) }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "purchases" },
      { name: "purchaseRevenue" },
      { name: "averagePurchaseRevenue" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 10,
  };

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  
  // Fetch both periods in parallel
  const [currentRes, previousRes] = await Promise.all([
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(currentQuery),
    }),
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(previousQuery),
    }),
  ]);

  const currentData = await currentRes.json();
  const previousData = await previousRes.json();

  if (!currentRes.ok) {
    throw new Error(currentData?.error?.message || "GA4 API error");
  }
  if (!previousRes.ok) {
    throw new Error(previousData?.error?.message || "GA4 API error");
  }

  // Merge data by channel
  const channelMap = new Map();
  
  // Process current period
  (currentData?.rows || []).forEach(row => {
    const channel = row.dimensionValues?.[0]?.value || "unknown";
    const metrics = row.metricValues || [];
    channelMap.set(channel, {
      channel,
      current: {
        sessions: Number(metrics[0]?.value || 0),
        users: Number(metrics[1]?.value || 0),
        purchases: Number(metrics[2]?.value || 0),
        revenue: Number(metrics[3]?.value || 0),
        aov: Number(metrics[4]?.value || 0),
      },
      previous: {
        sessions: 0,
        users: 0,
        purchases: 0,
        revenue: 0,
        aov: 0,
      },
    });
  });

  // Process previous period
  (previousData?.rows || []).forEach(row => {
    const channel = row.dimensionValues?.[0]?.value || "unknown";
    const metrics = row.metricValues || [];
    if (!channelMap.has(channel)) {
      channelMap.set(channel, {
        channel,
        current: { sessions: 0, users: 0, purchases: 0, revenue: 0, aov: 0 },
        previous: { sessions: 0, users: 0, purchases: 0, revenue: 0, aov: 0 },
      });
    }
    const entry = channelMap.get(channel);
    entry.previous = {
      sessions: Number(metrics[0]?.value || 0),
      users: Number(metrics[1]?.value || 0),
      purchases: Number(metrics[2]?.value || 0),
      revenue: Number(metrics[3]?.value || 0),
      aov: Number(metrics[4]?.value || 0),
    };
  });

  const rows = Array.from(channelMap.values()).sort((a, b) => b.current.sessions - a.current.sessions);

  // Calculate totals
  const totals = {
    previous: { sessions: 0, users: 0, purchases: 0, revenue: 0 },
    current: { sessions: 0, users: 0, purchases: 0, revenue: 0 },
  };

  rows.forEach(row => {
    totals.previous.sessions += row.previous.sessions;
    totals.previous.users += row.previous.users;
    totals.previous.purchases += row.previous.purchases;
    totals.previous.revenue += row.previous.revenue;
    
    totals.current.sessions += row.current.sessions;
    totals.current.users += row.current.users;
    totals.current.purchases += row.current.purchases;
    totals.current.revenue += row.current.revenue;
  });

  const result = {
    propertyId,
    dateRange: {
      previous: { start: formatDate(previousStart), end: formatDate(previousEnd) },
      current: { start: formatDate(currentStart), end: formatDate(yesterday) },
    },
    rows,
    totals,
    cached: false,
  };

  // Cache for 6 hours
  await kvSetJson(cacheKey, result, 60 * 60 * 6);

  return result;
}

/**
 * Prefetch GA4 summary for a connection (call after GA4 connection).
 */
export async function prefetchGA4Summary(connectionId, propertyId) {
  if (!connectionId || !propertyId) return;
  
  try {
    await fetchDefaultGA4Report(connectionId, propertyId);
  } catch (e) {
    console.error("[prefetchGA4Summary] Failed to prefetch:", e?.message || e);
    // Don't throw - prefetch is best-effort
  }
}
