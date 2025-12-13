#!/usr/bin/env node
/**
 * Verify all required environment variables for ChatGPT integration.
 * Run: node scripts/verify-env-vars.js
 */

const required = {
  // Database
  DATABASE_URL: "PostgreSQL connection string",
  
  // ChatGPT OAuth (you generate these, not from OpenAI)
  CHATGPT_CLIENT_ID: "ChatGPT OAuth client ID (generate yourself, enter in GPT editor)",
  CHATGPT_CLIENT_SECRET: "ChatGPT OAuth client secret (generate yourself, enter in GPT editor)",
  CHATGPT_REDIRECT_URI_ALLOWLIST: "ChatGPT callback origins allowlist (e.g., https://chat.openai.com,https://chatgpt.com)",
  
  // Google OAuth (for GA4)
  GOOGLE_CLIENT_ID: "Google OAuth client ID",
  GOOGLE_CLIENT_SECRET: "Google OAuth client secret",
  GOOGLE_REDIRECT_URI: "Google OAuth redirect URI",
  
  // OpenAI (for AI summaries)
  OPENAI_API_KEY: "OpenAI API key for AI summaries",
  
  // Vercel KV / Upstash
  UPSTASH_KV_REST_URL: "Upstash KV REST URL",
  UPSTASH_KV_REST_TOKEN: "Upstash KV REST token",
  
  // NextAuth
  NEXTAUTH_URL: "NextAuth base URL",
  NEXTAUTH_SECRET: "NextAuth secret for encryption",
};

const optional = {
  PREMIUM_URL: "Premium landing page URL (defaults to https://analyticsassistant.ai/premium)",
  NEXT_PUBLIC_PREMIUM_URL: "Alternative premium URL (public)",
  OPENAI_MODEL: "OpenAI model (defaults to gpt-4o-mini)",
  // Alternative naming for ChatGPT OAuth (for backwards compatibility)
  CHATGPT_OAUTH_CLIENT_ID: "Alternative name for CHATGPT_CLIENT_ID",
  CHATGPT_OAUTH_CLIENT_SECRET: "Alternative name for CHATGPT_CLIENT_SECRET",
  // Legacy - not used in GPT Actions flow
  CHATGPT_REDIRECT_URI: "Legacy: Fixed redirect URI (not used with GPT Actions - use ALLOWLIST instead)",
};

function checkEnv() {
  console.log("🔍 Checking Environment Variables\n");
  console.log("=" .repeat(60));
  
  let allGood = true;
  const missing = [];
  const present = [];
  
  // Check required
  console.log("\n📋 REQUIRED VARIABLES:\n");
  for (const [key, description] of Object.entries(required)) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      console.log(`❌ ${key}`);
      console.log(`   Missing: ${description}`);
      missing.push(key);
      allGood = false;
    } else {
      const masked = key.includes("SECRET") || key.includes("KEY") || key.includes("TOKEN")
        ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
        : value;
      console.log(`✅ ${key} = ${masked}`);
      present.push(key);
    }
  }
  
  // Check optional
  console.log("\n📋 OPTIONAL VARIABLES:\n");
  for (const [key, description] of Object.entries(optional)) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      console.log(`⚪ ${key} (not set - will use default)`);
      console.log(`   ${description}`);
    } else {
      console.log(`✅ ${key} = ${value}`);
      present.push(key);
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 SUMMARY:\n");
  console.log(`✅ Present: ${present.length}`);
  console.log(`❌ Missing: ${missing.length}`);
  
  if (allGood) {
    console.log("\n🎉 All required environment variables are set!\n");
    return 0;
  } else {
    console.log("\n⚠️  Missing required variables:\n");
    missing.forEach(key => {
      console.log(`   - ${key}: ${required[key]}`);
    });
    console.log("\n💡 TIP: Add these to your .env file or set them in your environment.\n");
    return 1;
  }
}

// Load .env if available
try {
  require("dotenv").config({ path: ".env" });
} catch (e) {
  // dotenv not installed, continue
}

try {
  require("dotenv").config({ path: "web/.env.local" });
} catch (e) {
  // dotenv not installed, continue
}

const exitCode = checkEnv();
process.exit(exitCode);
