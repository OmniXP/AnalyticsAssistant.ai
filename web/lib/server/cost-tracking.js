// web/lib/server/cost-tracking.js
// Service for tracking and aggregating costs from various providers

import { kvGetJson, kvSetJson } from "./ga4-session.js";

const COST_CACHE_KEY = "admin:costs:current";
const COST_HISTORY_KEY = "admin:costs:history";
const AI_USAGE_KEY = "admin:ai:usage";

// Track AI API usage
export async function trackAIUsage(model, tokens, cost) {
  const period = getCurrentPeriod();
  const key = `${AI_USAGE_KEY}:${period}`;
  
  const usage = (await kvGetJson(key)) || {
    period,
    requests: 0,
    totalTokens: 0,
    totalCost: 0,
    byModel: {},
  };

  usage.requests += 1;
  usage.totalTokens += tokens || 0;
  usage.totalCost += cost || 0;
  
  if (model) {
    usage.byModel[model] = (usage.byModel[model] || 0) + (cost || 0);
  }

  await kvSetJson(key, usage, 60 * 60 * 24 * 45); // 45 days TTL
  return usage;
}

// Get AI usage for current period
export async function getAIUsage(period = null) {
  const targetPeriod = period || getCurrentPeriod();
  const key = `${AI_USAGE_KEY}:${targetPeriod}`;
  return (await kvGetJson(key)) || {
    period: targetPeriod,
    requests: 0,
    totalTokens: 0,
    totalCost: 0,
    byModel: {},
  };
}

// Calculate OpenAI costs based on model and tokens
export function calculateOpenAICost(model, promptTokens, completionTokens) {
  // Pricing as of 2024 (update as needed)
  const pricing = {
    "gpt-4o-mini": {
      input: 0.15 / 1000000, // $0.15 per 1M input tokens
      output: 0.6 / 1000000, // $0.60 per 1M output tokens
    },
    "gpt-4o": {
      input: 2.5 / 1000000, // $2.50 per 1M input tokens
      output: 10 / 1000000, // $10.00 per 1M output tokens
    },
    "gpt-4": {
      input: 30 / 1000000, // $30 per 1M input tokens
      output: 60 / 1000000, // $60 per 1M output tokens
    },
  };

  const modelPricing = pricing[model] || pricing["gpt-4o-mini"];
  const inputCost = (promptTokens || 0) * modelPricing.input;
  const outputCost = (completionTokens || 0) * modelPricing.output;
  
  return {
    cost: inputCost + outputCost,
    inputCost,
    outputCost,
    tokens: (promptTokens || 0) + (completionTokens || 0),
  };
}

// Fetch Vercel usage (optional - requires Vercel API token via Integration)
// Note: VERCEL_API_TOKEN is not available in the standard dashboard.
// To enable this, you need to create a Vercel Integration and use its token.
// For most apps, you can skip this and rely on Vercel's built-in billing dashboard.
export async function getVercelUsage() {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) {
    // Not an error - just skip Vercel API tracking
    // Users can check costs directly in Vercel dashboard
    return { 
      skipped: true,
      note: "VERCEL_API_TOKEN not configured. Check costs in Vercel dashboard instead.",
      source: "estimated"
    };
  }

  try {
    const teamId = process.env.VERCEL_TEAM_ID;
    const projectId = process.env.VERCEL_PROJECT_ID;
    
    // Get current month usage
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const url = teamId
      ? `https://api.vercel.com/v1/teams/${teamId}/usage?since=${startOfMonth.getTime()}&until=${endOfMonth.getTime()}`
      : `https://api.vercel.com/v1/usage?since=${startOfMonth.getTime()}&until=${endOfMonth.getTime()}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return { 
        skipped: true,
        error: `Vercel API error: ${response.status}`,
        note: "Check costs in Vercel dashboard instead."
      };
    }

    const data = await response.json();
    
    return {
      functionInvocations: data.functions?.invocations || 0,
      functionExecutionTime: data.functions?.executionTime || 0,
      bandwidth: data.bandwidth?.bytes || 0,
      bandwidthGB: (data.bandwidth?.bytes || 0) / (1024 * 1024 * 1024),
      edgeRequests: data.edgeRequests || 0,
      source: "vercel_api",
    };
  } catch (error) {
    return { 
      skipped: true,
      error: error.message,
      note: "Check costs in Vercel dashboard instead."
    };
  }
}

// Fetch Upstash KV usage
export async function getUpstashUsage() {
  const url = process.env.UPSTASH_KV_REST_URL;
  const token = process.env.UPSTASH_KV_REST_TOKEN;
  
  if (!url || !token) {
    return { error: "Upstash credentials not configured" };
  }

  try {
    // Extract database ID from URL
    const dbIdMatch = url.match(/\/rest\/([^\/]+)/);
    if (!dbIdMatch) {
      return { error: "Could not extract database ID from UPSTASH_KV_REST_URL" };
    }

    const dbId = dbIdMatch[1];
    const apiUrl = `https://api.upstash.com/v2/kv/database/${dbId}/usage`;

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return { error: `Upstash API error: ${response.status}` };
    }

    const data = await response.json();
    
    return {
      reads: data.reads || 0,
      writes: data.writes || 0,
      source: "upstash_api",
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Fetch Neon database usage (requires Neon API)
export async function getNeonUsage() {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  
  if (!apiKey || !projectId) {
    return { error: "Neon API credentials not configured" };
  }

  try {
    const response = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { error: `Neon API error: ${response.status}` };
    }

    const data = await response.json();
    const project = data.project || {};
    
    return {
      storageBytes: project.storage_bytes || 0,
      storageGB: (project.storage_bytes || 0) / (1024 * 1024 * 1024),
      computeHours: project.compute_hours || 0,
      source: "neon_api",
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Fetch Stripe revenue and fees
export async function getStripeRevenue() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return { error: "Stripe secret key not configured" };
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);

    const now = new Date();
    const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const endOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime() / 1000);

    // Get charges for current month
    const charges = await stripe.charges.list({
      created: { gte: startOfMonth, lte: endOfMonth },
      limit: 100,
    });

    let totalRevenue = 0;
    let totalFees = 0;
    let transactionCount = 0;

    for (const charge of charges.data) {
      if (charge.paid && charge.amount > 0) {
        totalRevenue += charge.amount / 100; // Convert from cents
        totalFees += (charge.application_fee_amount || 0) / 100;
        transactionCount += 1;
      }
    }

    // Also check for subscription revenue
    const subscriptions = await stripe.subscriptions.list({
      created: { gte: startOfMonth, lte: endOfMonth },
      status: "active",
      limit: 100,
    });

    for (const sub of subscriptions.data) {
      const amount = sub.items.data[0]?.price?.unit_amount || 0;
      totalRevenue += amount / 100;
      transactionCount += 1;
    }

    return {
      revenue: totalRevenue,
      fees: totalFees,
      transactions: transactionCount,
      source: "stripe_api",
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Calculate costs from usage data
export function calculateCosts(usage) {
  const costs = {
    vercel: 0,
    database: 0,
    kv: 0,
    ai: usage.ai?.totalCost || 0,
    stripe: usage.stripe?.fees || 0,
  };

  // Vercel costs (only if API data available)
  if (usage.vercel && !usage.vercel.error && !usage.vercel.skipped) {
    const base = 20; // Vercel Pro base (estimate)
    const invocations = (usage.vercel.functionInvocations || 0) * 0.0000002; // $0.20 per million
    const bandwidth = (usage.vercel.bandwidthGB || 0) * 0.10; // $0.10 per GB
    costs.vercel = base + invocations + bandwidth;
  } else {
    // Estimate Vercel costs if API not available
    // Users should check Vercel dashboard for accurate costs
    costs.vercel = 20; // Base Pro plan estimate
  }

  // Database costs (Neon)
  if (usage.database && !usage.database.error) {
    const freeGB = 0.5;
    const storageGB = usage.database.storageGB || 0;
    if (storageGB > freeGB) {
      costs.database = (storageGB - freeGB) * 0.10; // $0.10 per GB over free tier
    }
    // Add compute costs if available
    if (usage.database.computeHours) {
      costs.database += usage.database.computeHours * 0.10;
    }
  }

  // KV costs (Upstash)
  if (usage.kv && !usage.kv.error) {
    const freeReads = 10000;
    const reads = usage.kv.reads || 0;
    const writes = usage.kv.writes || 0;
    
    if (reads > freeReads) {
      costs.kv += ((reads - freeReads) / 1000000) * 0.20; // $0.20 per million reads
    }
    costs.kv += (writes / 1000000) * 0.20; // $0.20 per million writes
  }

  costs.total = Object.values(costs).reduce((sum, val) => sum + val, 0);
  
  return costs;
}

// Get current period (YYYY-MM)
function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Aggregate all usage data
export async function getAggregatedUsage() {
  const [vercel, database, kv, ai, stripe] = await Promise.all([
    getVercelUsage(),
    getNeonUsage(),
    getUpstashUsage(),
    getAIUsage(),
    getStripeRevenue(),
  ]);

  return {
    vercel,
    database,
    kv,
    ai,
    stripe,
    period: getCurrentPeriod(),
    timestamp: new Date().toISOString(),
  };
}

// Cache aggregated costs
export async function cacheCosts(usage, costs) {
  const data = {
    usage,
    costs,
    period: getCurrentPeriod(),
    timestamp: new Date().toISOString(),
  };
  
  await kvSetJson(COST_CACHE_KEY, data, 60 * 60); // Cache for 1 hour
  
  // Also store in history
  const history = (await kvGetJson(COST_HISTORY_KEY)) || [];
  history.push(data);
  // Keep last 12 months
  const recentHistory = history.slice(-12);
  await kvSetJson(COST_HISTORY_KEY, recentHistory, 60 * 60 * 24 * 365);
  
  return data;
}

// Get cached costs
export async function getCachedCosts() {
  return await kvGetJson(COST_CACHE_KEY);
}

