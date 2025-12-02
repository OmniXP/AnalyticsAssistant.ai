// web/lib/server/ai-tracking.js
// Helper to track AI API usage and costs
import { trackAIUsage, calculateOpenAICost } from "./cost-tracking.js";

/**
 * Track OpenAI API usage from a response
 * @param {string} model - The model used (e.g., "gpt-4o-mini")
 * @param {object} usage - Usage object from OpenAI API response
 */
export async function trackOpenAIUsage(model, usage) {
  try {
    if (!usage || !model) return;

    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const costData = calculateOpenAICost(model, promptTokens, completionTokens);

    await trackAIUsage(model, costData.tokens, costData.cost);
  } catch (error) {
    // Silently fail - don't break the API if tracking fails
    console.error("[ai-tracking] Failed to track usage:", error.message);
  }
}

