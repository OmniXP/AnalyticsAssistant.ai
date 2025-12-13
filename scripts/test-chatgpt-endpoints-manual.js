#!/usr/bin/env node
/**
 * Manual testing guide for ChatGPT endpoints.
 * This script provides curl commands and test scenarios.
 * Run: node scripts/test-chatgpt-endpoints-manual.js
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const CHATGPT_CLIENT_ID = process.env.CHATGPT_CLIENT_ID || "YOUR_CLIENT_ID";
const CHATGPT_CLIENT_SECRET = process.env.CHATGPT_CLIENT_SECRET || "YOUR_CLIENT_SECRET";

console.log("🧪 ChatGPT Endpoints Manual Testing Guide\n");
console.log("=" .repeat(60));
console.log(`Base URL: ${BASE_URL}`);
console.log(`Client ID: ${CHATGPT_CLIENT_ID.substring(0, 8)}...`);
console.log("=" .repeat(60));
console.log("");

console.log("Step 1: Test OAuth Authorization Endpoint");
console.log("-".repeat(60));
console.log(`curl "${BASE_URL}/api/chatgpt/oauth/authorize?client_id=${CHATGPT_CLIENT_ID}&redirect_uri=${encodeURIComponent(BASE_URL + "/api/chatgpt/oauth/callback")}&response_type=code"`);
console.log("\nExpected: Redirect with 'code' parameter\n");

console.log("Step 2: Test Token Exchange");
console.log("-".repeat(60));
console.log("First, get a code from Step 1, then:");
console.log(`curl -X POST ${BASE_URL}/api/chatgpt/oauth/token \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{`);
console.log(`    "grant_type": "authorization_code",`);
console.log(`    "code": "CODE_FROM_STEP_1",`);
console.log(`    "client_id": "${CHATGPT_CLIENT_ID}",`);
console.log(`    "client_secret": "${CHATGPT_CLIENT_SECRET}",`);
console.log(`    "chatgpt_user_id": "test_user_123",`);
console.log(`    "email": "test@example.com"`);
console.log(`  }'`);
console.log("\nExpected: { access_token: "...", token_type: "Bearer", expires_in: 3600 }\n");

console.log("Step 3: Test Userinfo Endpoint");
console.log("-".repeat(60));
console.log("Use the access_token from Step 2:");
console.log(`curl ${BASE_URL}/api/chatgpt/oauth/user \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`);
console.log("\nExpected: User info with premium status and upgradeUrl\n");

console.log("Step 4: Test Status Endpoint");
console.log("-".repeat(60));
console.log(`curl ${BASE_URL}/api/chatgpt/v1/status \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`);
console.log("\nExpected: { ok: true, user: {...}, ga4: {...}, upgradeUrl: "..." }\n");

console.log("Step 5: Test Properties Endpoint (requires GA4 connection)");
console.log("-".repeat(60));
console.log(`curl ${BASE_URL}/api/chatgpt/v1/properties \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`);
console.log("\nExpected: List of GA4 properties (limited by plan)\n");

console.log("Step 6: Test Query Endpoint (requires GA4 connection)");
console.log("-".repeat(60));
console.log(`curl -X POST ${BASE_URL}/api/chatgpt/v1/query \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{`);
console.log(`    "propertyId": "properties/123456789",`);
console.log(`    "startDate": "2024-11-01",`);
console.log(`    "endDate": "2024-11-30",`);
console.log(`    "limit": 10`);
console.log(`  }'`);
console.log("\nExpected: GA4 query results\n");

console.log("Step 7: Test Summarise Endpoint (requires GA4 connection)");
console.log("-".repeat(60));
console.log(`curl -X POST ${BASE_URL}/api/chatgpt/v1/summarise \\`);
console.log(`  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{`);
console.log(`    "rows": [`);
console.log(`      { "channel": "Organic Search", "sessions": 1000, "users": 800 }`);
console.log(`    ],`);
console.log(`    "totals": { "sessions": 1000, "users": 800 },`);
console.log(`    "dateRange": { "start": "2024-11-01", "end": "2024-11-30" }`);
console.log(`  }'`);
console.log("\nExpected: AI-generated summary\n");

console.log("=" .repeat(60));
console.log("\n💡 Tips:");
console.log("- Replace YOUR_ACCESS_TOKEN with actual token from Step 2");
console.log("- For GA4 endpoints, you need to connect GA4 first via /api/chatgpt/oauth/ga4/start");
console.log("- Free plan users will see upgrade messages when limits are reached");
console.log("- Check Vercel KV for token storage: chatgpt_token:* and chatgpt_ga4_tokens:*");
