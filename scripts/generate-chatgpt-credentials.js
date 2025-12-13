#!/usr/bin/env node
/**
 * Generate secure ChatGPT OAuth client ID and secret.
 * Run: node scripts/generate-chatgpt-credentials.js
 * 
 * These are the credentials you'll enter in:
 * 1. Your .env file
 * 2. GPT Editor → Actions → Authentication → OAuth
 */

const crypto = require("crypto");

function generateSecureString(length = 32) {
  return crypto.randomBytes(length).toString("base64url");
}

console.log("🔐 Generating ChatGPT OAuth Credentials\n");
console.log("=".repeat(60));
console.log("\nCopy these values to:");
console.log("1. Your .env file (CHATGPT_CLIENT_ID and CHATGPT_CLIENT_SECRET)");
console.log("2. GPT Editor → Actions → Authentication → OAuth\n");
console.log("=".repeat(60));
console.log("\n");

const clientId = generateSecureString(24);
const clientSecret = generateSecureString(32);

console.log("CHATGPT_CLIENT_ID=" + clientId);
console.log("CHATGPT_CLIENT_SECRET=" + clientSecret);

console.log("\n" + "=".repeat(60));
console.log("\n💡 Important:");
console.log("- These are YOUR credentials (not from OpenAI)");
console.log("- Enter the SAME values in both .env and GPT Editor");
console.log("- Keep the secret secure (never commit to git)\n");
