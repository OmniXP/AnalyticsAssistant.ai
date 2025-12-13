#!/usr/bin/env node
/**
 * Test ChatGPT OAuth endpoints (manual testing guide).
 * Run: node scripts/test-oauth-endpoints.js
 * 
 * This script provides curl commands and instructions for testing.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
const CLIENT_ID = process.env.CHATGPT_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.CHATGPT_CLIENT_SECRET || "YOUR_CLIENT_SECRET";

console.log("🧪 ChatGPT OAuth Endpoint Testing Guide\n");
console.log("=".repeat(60));
console.log(`\nBase URL: ${BASE_URL}`);
console.log(`Client ID: ${CLIENT_ID.substring(0, 8)}...`);
console.log("\n");

console.log("📋 TEST 1: Authorization Endpoint\n");
console.log("This should redirect with a code parameter.\n");
console.log(`curl "${BASE_URL}/api/chatgpt/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(BASE_URL + "/api/chatgpt/oauth/callback")}&response_type=code"`);
console.log("\nExpected: HTTP 302 redirect with 'code' parameter\n");

console.log("=".repeat(60));
console.log("\n📋 TEST 2: Token Exchange\n");
console.log("After getting a code from Test 1, exchange it for an access token.\n");
console.log("Replace CODE_FROM_TEST_1 with the actual code:\n");
console.log(`curl -X POST ${BASE_URL}/api/chatgpt/oauth/token \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{`);
console.log(`    "grant_type": "authorization_code",`);
console.log(`    "code": "CODE_FROM_TEST_1",`);
console.log(`    "client_id": "${CLIENT_ID}",`);
console.log(`    "client_secret": "${CLIENT_SECRET}",`);
console.log(`    "chatgpt_user_id": "test_user_123",`);
console.log(`    "email": "test@example.com"`);
console.log(`  }'`);
console.log("\nExpected: { \"access_token\": \"...\", \"token_type\": \"Bearer\", \"expires_in\": 3600 }\n");

console.log("=".repeat(60));
console.log("\n📋 TEST 3: Userinfo Endpoint\n");
console.log("Use the access token from Test 2:\n");
console.log(`curl ${BASE_URL}/api/chatgpt/oauth/user \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`);
console.log("\nExpected: User info with premium status, email, upgradeUrl\n");

console.log("=".repeat(60));
console.log("\n📋 TEST 4: Status Endpoint\n");
console.log(`curl ${BASE_URL}/api/chatgpt/v1/status \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`);
console.log("\nExpected: Connection status, premium status, GA4 connection status\n");

console.log("=".repeat(60));
console.log("\n💡 TIPS:");
console.log("1. Make sure your dev server is running: cd web && npm run dev");
console.log("2. Set CHATGPT_CLIENT_ID and CHATGPT_CLIENT_SECRET in .env");
console.log("3. For production, use your production domain instead of localhost");
console.log("4. Check Vercel function logs if endpoints return errors\n");
