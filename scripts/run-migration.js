#!/usr/bin/env node
/**
 * Helper script to run the ChatGPT integration database migration.
 * Run: node scripts/run-migration.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("🔄 Running ChatGPT Integration Migration\n");
console.log("=" .repeat(60));

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.log("❌ DATABASE_URL not found in environment.\n");
  console.log("💡 Options:");
  console.log("   1. Set DATABASE_URL in your .env file");
  console.log("   2. Export it: export DATABASE_URL='postgresql://...'");
  console.log("   3. Pass it: DATABASE_URL='...' node scripts/run-migration.js\n");
  
  // Try to load from .env
  const envPath = path.join(__dirname, "..", ".env");
  const envLocalPath = path.join(__dirname, "..", "web", ".env.local");
  
  let foundEnv = false;
  for (const envFile of [envPath, envLocalPath]) {
    if (fs.existsSync(envFile)) {
      console.log(`📄 Found ${envFile}, attempting to load...\n`);
      const envContent = fs.readFileSync(envFile, "utf8");
      const match = envContent.match(/^DATABASE_URL=(.+)$/m);
      if (match) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
        foundEnv = true;
        console.log("✅ Loaded DATABASE_URL from .env file\n");
        break;
      }
    }
  }
  
  if (!foundEnv) {
    console.log("❌ Could not find DATABASE_URL. Please set it and try again.\n");
    process.exit(1);
  }
}

// Verify migration file exists
const migrationPath = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  "20251201000000_add_chatgpt_fields",
  "migration.sql"
);

if (!fs.existsSync(migrationPath)) {
  console.log("❌ Migration file not found:");
  console.log(`   ${migrationPath}\n`);
  console.log("💡 Make sure you're on the correct branch with the migration.\n");
  process.exit(1);
}

console.log("✅ Migration file found\n");

// Run migration
console.log("🚀 Running migration...\n");
try {
  execSync("npx prisma migrate dev --name add_chatgpt_fields", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: { ...process.env },
  });
  console.log("\n✅ Migration completed successfully!\n");
} catch (error) {
  console.log("\n❌ Migration failed!\n");
  console.log("💡 Common issues:");
  console.log("   - Database connection failed (check DATABASE_URL)");
  console.log("   - Database user lacks permissions");
  console.log("   - Migration already applied (check with: npx prisma migrate status)");
  console.log("   - Network issues\n");
  process.exit(1);
}

// Generate Prisma client
console.log("🔨 Generating Prisma client...\n");
try {
  execSync("npx prisma generate", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: { ...process.env },
  });
  console.log("\n✅ Prisma client generated!\n");
} catch (error) {
  console.log("\n❌ Failed to generate Prisma client\n");
  process.exit(1);
}

// Verify migration
console.log("🔍 Verifying migration status...\n");
try {
  execSync("npx prisma migrate status", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: { ...process.env },
  });
  console.log("\n✅ All migrations applied!\n");
} catch (error) {
  console.log("\n⚠️  Could not verify migration status (this is usually fine)\n");
}

console.log("=" .repeat(60));
console.log("\n🎉 Migration complete! Your database is ready for ChatGPT integration.\n");
console.log("📋 Next steps:");
console.log("   1. Set environment variables (run: node scripts/verify-env-vars.js)");
console.log("   2. Configure ChatGPT app in OpenAI platform");
console.log("   3. Test endpoints locally");
console.log("   4. Deploy to production\n");
