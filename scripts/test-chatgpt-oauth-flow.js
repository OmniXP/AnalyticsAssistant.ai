#!/usr/bin/env node
/**
 * Manual end-to-end ChatGPT OAuth + GA4 flow checklist.
 * Run: `node scripts/test-chatgpt-oauth-flow.js`
 */

console.log("ChatGPT OAuth Flow Checklist");
console.log("1) GET /api/chatgpt/oauth/authorize with client_id + redirect_uri (expect 302 to Google)");
console.log("2) Complete Google consent -> redirected to /api/chatgpt/oauth/ga4/callback");
console.log("3) Verify GA4 tokens stored at chatgpt_ga4_tokens:<chatgptUserId>");
console.log("4) Exchange code via /api/chatgpt/oauth/token to get Bearer token");
console.log("5) Call /api/chatgpt/oauth/user with Bearer token (expect user payload)");
console.log("6) Call /api/chatgpt/v1/status (connected=true, upgradeUrl present)");
console.log("7) Call /api/chatgpt/v1/properties and /api/chatgpt/v1/query to confirm data returns");
