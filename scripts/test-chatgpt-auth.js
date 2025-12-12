#!/usr/bin/env node
/**
 * Quick manual checklist for ChatGPT auth helpers.
 * Run: `node scripts/test-chatgpt-auth.js`
 */

console.log("ChatGPT Auth Test Checklist");
console.log("- Ensure env: CHATGPT_CLIENT_ID, CHATGPT_CLIENT_SECRET set");
console.log("- Simulate OAuth code -> token exchange via /api/chatgpt/oauth/token");
console.log("- Verify token stored in KV: chatgpt_token:<token>");
console.log("- Call /api/chatgpt/oauth/user with Bearer token -> expect user payload");
console.log("- Create/link user via getOrCreateChatGPTUser (check DB row)");
console.log("- GA4 tokens stored under chatgpt_ga4_tokens:<chatgptUserId> after GA4 callback");
console.log("- Refresh flow: ensure expired token refreshes using refresh_token");
