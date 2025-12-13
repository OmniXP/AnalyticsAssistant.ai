#!/usr/bin/env node
/**
 * Check database migration status and verify ChatGPT fields exist.
 * Run: node scripts/check-migration-status.js
 */

const { execSync } = require("child_process");
const path = require("path");

function runCommand(cmd, cwd = process.cwd()) {
  try {
    const result = execSync(cmd, { cwd, encoding: "utf8", stdio: "pipe" });
    return { success: true, stdout: result, stderr: "" };
  } catch (e) {
    // Prisma often writes to stderr even on success, so check both
    const stdout = e.stdout || "";
    const stderr = e.stderr || "";
    const combined = stdout + stderr;
    
    // If we see migration info, it's actually a success
    if (combined.includes("migrations found") || combined.includes("migration") || e.status === 0) {
      return { success: true, stdout: stdout, stderr: stderr, combined: combined };
    }
    
    return { success: false, error: e.message, stdout: stdout, stderr: stderr, combined: combined };
  }
}

function checkMigrationStatus() {
  console.log("🔍 Checking Database Migration Status\n");
  console.log("=".repeat(60));
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.log("\n❌ DATABASE_URL not found in environment");
    console.log("   Please set DATABASE_URL in your .env file or environment");
    console.log("   Example: DATABASE_URL=postgresql://user:password@host:port/database\n");
    return 1;
  }
  
  console.log("\n✅ DATABASE_URL is set");
  
  // Check Prisma migration status
  console.log("\n📋 Checking Prisma migration status...\n");
  const statusResult = runCommand("npx prisma migrate status");
  
  const output = statusResult.combined || statusResult.stdout || statusResult.stderr || "";
  
  if (!statusResult.success && !output.includes("migrations found") && !output.includes("migration")) {
    console.log("⚠️  Could not check migration status:");
    console.log(output || statusResult.error);
    console.log("\n💡 Try running: npx prisma migrate dev --name add_chatgpt_fields\n");
    return 1;
  }
  
  // Show the output (filter out the config loading message)
  const cleanOutput = output.split("\n").filter(line => 
    !line.includes("Loaded Prisma config") && 
    !line.includes("Prisma config detected")
  ).join("\n");
  
  if (cleanOutput.trim()) {
    console.log(cleanOutput);
  }
  
  // Check if migration needs to be applied
  if (output.includes("have not yet been applied") || (output.includes("add_chatgpt_fields") && output.includes("not yet"))) {
    console.log("\n⚠️  Migration exists but not yet applied to database");
    console.log("   Run: npx prisma migrate dev --name add_chatgpt_fields");
  } else if (output.includes("add_chatgpt_fields") && output.includes("applied")) {
    console.log("\n✅ Migration has been applied");
  }
  
  // Check if migration file exists
  const migrationFile = path.join(
    process.cwd(),
    "prisma/migrations/20251201000000_add_chatgpt_fields/migration.sql"
  );
  
  const fs = require("fs");
  if (fs.existsSync(migrationFile)) {
    console.log("\n✅ Migration file exists: 20251201000000_add_chatgpt_fields");
  } else {
    console.log("\n⚠️  Migration file not found");
    console.log("   Expected: prisma/migrations/20251201000000_add_chatgpt_fields/migration.sql");
  }
  
  // Try to verify schema
  console.log("\n📋 Verifying Prisma schema...\n");
  const schemaPath = path.join(process.cwd(), "prisma/schema.prisma");
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    if (schema.includes("chatgptUserId")) {
      console.log("✅ Schema includes chatgptUserId field");
    } else {
      console.log("❌ Schema missing chatgptUserId field");
      return 1;
    }
    if (schema.includes("chatgptConnectedAt")) {
      console.log("✅ Schema includes chatgptConnectedAt field");
    } else {
      console.log("❌ Schema missing chatgptConnectedAt field");
      return 1;
    }
  } else {
    console.log("⚠️  Schema file not found");
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("\n💡 Next steps:");
  console.log("   1. If migration not applied: npx prisma migrate dev --name add_chatgpt_fields");
  console.log("   2. Generate Prisma client: npx prisma generate");
  console.log("   3. Verify: npx prisma studio (opens database viewer)\n");
  
  return 0;
}

// Load .env files (try multiple locations)
const fs = require("fs");

// Try to load dotenv if available
try {
  require("dotenv").config({ path: path.join(process.cwd(), ".env") });
} catch (e) {
  // dotenv not installed or .env doesn't exist
}

try {
  require("dotenv").config({ path: path.join(process.cwd(), "web/.env.local") });
} catch (e) {
  // .env.local doesn't exist
}

// Also manually check and load web/.env.local if it exists (fallback if dotenv doesn't work)
const webEnvPath = path.join(process.cwd(), "web/.env.local");
if (fs.existsSync(webEnvPath) && !process.env.DATABASE_URL) {
  const envContent = fs.readFileSync(webEnvPath, "utf8");
  envContent.split("\n").forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const exitCode = checkMigrationStatus();
process.exit(exitCode);
