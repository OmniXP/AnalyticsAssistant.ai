#!/usr/bin/env node
/**
 * Manual test checklist for ChatGPT API endpoints.
 * Run: `node scripts/test-chatgpt-endpoints.js`
 */

console.log("ChatGPT Endpoints Test Checklist");
console.log("- Auth: obtain Bearer token via /api/chatgpt/oauth/token");
console.log("- Status: GET /api/chatgpt/v1/status (expect premium + GA4 flags, upgradeUrl)");
console.log("- Properties: GET /api/chatgpt/v1/properties (respect plan limits, upgrade when limited)");
console.log("- Query: POST /api/chatgpt/v1/query with propertyId/startDate/endDate");
console.log("  - Free plan should block startDate older than 90 days with upgrade payload");
console.log("- Summarise: POST /api/chatgpt/v1/summarise with rows/totals/dateRange");
console.log("- Rate limits: exceed GA4/AI limits to verify RATE_LIMITED + upgrade messages");
