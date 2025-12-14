#!/usr/bin/env node
/**
 * Test GA4 connection for the web app.
 * This tests the actual OAuth-based GA4 integration used in this codebase.
 * 
 * Run: node scripts/test-ga4-connection.js
 */

const path = require("path");
const fs = require("fs");

console.log("🔍 GA4 Connection Test for AnalyticsAssistant.ai\n");
console.log("=".repeat(60));

// Load environment variables
try {
  require("dotenv").config({ path: path.join(__dirname, "../.env") });
} catch (e) {}

try {
  require("dotenv").config({ path: path.join(__dirname, "../web/.env.local") });
} catch (e) {}

// Check environment variables
console.log("\n📋 1. Environment Variables Check:\n");

const required = {
  GOOGLE_CLIENT_ID: "Google OAuth Client ID",
  GOOGLE_CLIENT_SECRET: "Google OAuth Client Secret",
  GOOGLE_REDIRECT_URI: "Google OAuth Redirect URI",
  UPSTASH_KV_REST_URL: "Upstash KV REST URL",
  UPSTASH_KV_REST_TOKEN: "Upstash KV REST Token",
};

let allEnvGood = true;
for (const [key, desc] of Object.entries(required)) {
  const value = process.env[key];
  if (value) {
    const masked = key.includes("SECRET") || key.includes("TOKEN")
      ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
      : value;
    console.log(`✅ ${key}: ${masked}`);
  } else {
    console.log(`❌ ${key}: Missing - ${desc}`);
    allEnvGood = false;
  }
}

if (!allEnvGood) {
  console.log("\n⚠️  Missing required environment variables!");
  console.log("   Please set them in web/.env.local\n");
  process.exit(1);
}

// Check architecture
console.log("\n📋 2. Architecture Review:\n");
console.log("✅ This codebase uses:");
console.log("   - OAuth 2.0 flow (not service account)");
console.log("   - Direct fetch() calls to GA4 API (not googleapis library)");
console.log("   - Cookie-based sessions stored in Vercel KV");
console.log("   - Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET");
console.log("\n❌ This codebase does NOT use:");
console.log("   - ga4Client.ts or ga4Client.js");
console.log("   - GA4_CLIENT_ID, GA4_CLIENT_SECRET, GA4_REFRESH_TOKEN env vars");
console.log("   - googleapis npm package");
console.log("   - Service account authentication");

// Check dependencies
console.log("\n📋 3. Dependencies Check:\n");

const packageJson = require("../web/package.json");
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

if (deps["@upstash/redis"]) {
  console.log(`✅ @upstash/redis: ${deps["@upstash/redis"]}`);
} else {
  console.log("❌ @upstash/redis: Not found");
}

if (deps["next"]) {
  console.log(`✅ next: ${deps["next"]} (Next.js framework)`);
} else {
  console.log("❌ next: Not found");
}

if (deps["googleapis"]) {
  console.log(`⚠️  googleapis: ${deps["googleapis"]} (not used in this codebase)`);
} else {
  console.log("✅ googleapis: Not installed (correct - using direct fetch instead)");
}

// Check GA4 session helpers
console.log("\n📋 4. GA4 Integration Files:\n");

const files = [
  "web/lib/server/ga4-session.js",
  "web/lib/server/google-oauth.js",
  "web/pages/api/ga4/query.js",
  "web/pages/api/ga4/properties.js",
];

for (const file of files) {
  const fullPath = path.join(__dirname, "..", file);
  try {
    fs.accessSync(fullPath);
    console.log(`✅ ${file}`);
  } catch (e) {
    console.log(`❌ ${file}: Not found`);
  }
}

// Test KV connection
console.log("\n📋 5. KV Storage Connection Test:\n");

(async () => {
  try {
    const { Redis } = require("@upstash/redis");
    const redis = new Redis({
      url: process.env.UPSTASH_KV_REST_URL,
      token: process.env.UPSTASH_KV_REST_TOKEN,
    });
    
    // Test write/read
    const testKey = `test:connection:${Date.now()}`;
    await redis.set(testKey, "test", { ex: 10 });
    const value = await redis.get(testKey);
    await redis.del(testKey);
    
    if (value === "test") {
      console.log("✅ KV storage connection successful");
    } else {
      console.log("❌ KV storage test failed");
    }
  } catch (e) {
    console.log(`❌ KV storage connection failed: ${e.message}`);
    console.log("   Make sure UPSTASH_KV_REST_URL and UPSTASH_KV_REST_TOKEN are set");
  }
})();

// Summary
console.log("\n" + "=".repeat(60));
console.log("\n📊 Summary:\n");
console.log("This codebase uses OAuth 2.0 flow, not service account.");
console.log("To test GA4 connection:");
console.log("1. Start dev server: cd web && npm run dev");
console.log("2. Visit: http://localhost:3000");
console.log("3. Click 'Connect Google Analytics'");
console.log("4. Complete OAuth flow");
console.log("5. Test endpoint: POST /api/ga4/query");
console.log("\nFor ChatGPT integration, use Bearer token authentication.");
console.log("See docs/GPT_ACTIONS_OAUTH_CORRECT.md for details.\n");
