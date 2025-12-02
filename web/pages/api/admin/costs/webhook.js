// web/pages/api/admin/costs/webhook.js
// Webhook endpoint for receiving cost updates from external services
import { cacheCosts, calculateCosts, getAggregatedUsage } from "../../../../lib/server/cost-tracking.js";

// Webhook secret for verification (set in env)
const WEBHOOK_SECRET = process.env.COST_WEBHOOK_SECRET || "";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify webhook secret if configured
  if (WEBHOOK_SECRET) {
    const providedSecret = req.headers["x-webhook-secret"] || req.body?.secret;
    if (providedSecret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid webhook secret" });
    }
  }

  try {
    const { source, usage, costs } = req.body || {};

    // If usage data provided, calculate costs
    if (usage) {
      const calculatedCosts = calculateCosts({ [source]: usage });
      await cacheCosts({ [source]: usage }, calculatedCosts);
      return res.status(200).json({ success: true, costs: calculatedCosts });
    }

    // If costs provided directly, cache them
    if (costs) {
      const currentUsage = await getAggregatedUsage();
      await cacheCosts(currentUsage, costs);
      return res.status(200).json({ success: true });
    }

    // Otherwise, refresh from APIs
    const aggregatedUsage = await getAggregatedUsage();
    const calculatedCosts = calculateCosts(aggregatedUsage);
    await cacheCosts(aggregatedUsage, calculatedCosts);

    return res.status(200).json({
      success: true,
      usage: aggregatedUsage,
      costs: calculatedCosts,
    });
  } catch (error) {
    console.error("[costs/webhook] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to process webhook" });
  }
}

