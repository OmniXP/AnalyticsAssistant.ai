# Complete ChatGPT Integration Setup Guide

**Comprehensive, step-by-step guide with full expertise and troubleshooting.**

---

## 📋 Table of Contents

1. [Prerequisites Check](#1-prerequisites-check)
2. [Environment Variables Setup](#2-environment-variables-setup)
3. [Database Migration](#3-database-migration)
4. [OpenAI Platform Configuration](#4-openai-platform-configuration)
5. [Local Testing](#5-local-testing)
6. [Production Deployment](#6-production-deployment)
7. [Verification & Testing](#7-verification--testing)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites Check

### 1.1 Verify Your Environment

Before starting, ensure you have:

- ✅ **Node.js 18+** installed
- ✅ **PostgreSQL database** accessible
- ✅ **Vercel account** (for deployment)
- ✅ **OpenAI account** with ChatGPT app access
- ✅ **Git** repository set up

### 1.2 Check Current Setup

```bash
# Navigate to project root
cd /Users/simonwhitmore/Documents/GitHub/analyticsassistant-ai

# Check Node version
node --version  # Should be 18+

# Check if database is accessible (if DATABASE_URL is set)
# This will be verified in Step 3
```

### 1.3 Verify Existing Web App Works

**Critical:** Make sure your web app is functioning before adding ChatGPT integration.

```bash
# Start dev server
cd web
npm run dev

# Visit http://localhost:3000
# Test login, GA4 connection, and existing features
```

**If anything is broken, fix it first before proceeding.**

---

## 2. Environment Variables Setup

### 2.1 Locate Your .env File

Your environment variables can be in:
- `web/.env.local` (Next.js convention)
- `.env` (project root)
- Both (Next.js will merge them)

**Check which one exists:**
```bash
ls -la web/.env.local
ls -la .env
```

### 2.2 Verify Existing Variables

First, check what you already have:

```bash
# Run the verification script
node scripts/verify-env-vars.js
```

This will show:
- ✅ Variables that are set
- ❌ Variables that are missing
- ⚪ Optional variables

### 2.3 Add ChatGPT Variables

**Open your `.env` file** (create it if it doesn't exist):

```bash
# If using web/.env.local
nano web/.env.local

# Or if using .env in root
nano .env
```

**Add these lines:**

```bash
# ============================================
# ChatGPT Integration Variables
# ============================================

# ChatGPT OAuth (get these from OpenAI in Step 4)
CHATGPT_CLIENT_ID=your_client_id_here
CHATGPT_CLIENT_SECRET=your_client_secret_here
CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback

# Premium URL (optional - has default)
PREMIUM_URL=https://analyticsassistant.ai/premium
```

**For local testing, you can use:**
```bash
CHATGPT_REDIRECT_URI=http://localhost:3000/api/chatgpt/oauth/callback
```

### 2.4 Verify All Required Variables

**Run verification again:**
```bash
node scripts/verify-env-vars.js
```

**Expected output:**
- All required variables should show ✅
- ChatGPT variables can be placeholders for now (we'll update them in Step 4)

### 2.5 Common Issues

**Issue:** "DATABASE_URL not found"
- **Solution:** Add `DATABASE_URL=postgresql://user:password@host:port/database` to your `.env`

**Issue:** "Variables not loading"
- **Solution:** Make sure file is named exactly `.env.local` or `.env` (no typos)
- **Solution:** Restart your dev server after adding variables

---

## 3. Database Migration

### 3.1 Understand What the Migration Does

The migration adds two fields to your `User` table:
- `chatgptUserId` (TEXT, unique) - Links ChatGPT users to your database
- `chatgptConnectedAt` (TIMESTAMP) - Tracks when user connected via ChatGPT

**This is safe:** It only adds columns, doesn't modify existing data.

### 3.2 Check Migration Status

```bash
# From project root
node scripts/check-migration-status.js
```

This will:
- ✅ Check if DATABASE_URL is set
- ✅ Check Prisma migration status
- ✅ Verify schema includes ChatGPT fields

### 3.3 Run the Migration

**Option A: Development (creates migration, applies it, generates client)**

```bash
# From project root
npx prisma migrate dev --name add_chatgpt_fields
```

**Expected output:**
```
✔ Migration `20251201000000_add_chatgpt_fields` applied successfully.
✔ Generated Prisma Client
```

**Option B: If migration already exists (just apply it)**

```bash
npx prisma migrate deploy
```

### 3.4 Generate Prisma Client

After migration, generate the Prisma client:

```bash
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client
```

### 3.5 Verify Migration Succeeded

**Option 1: Check migration status**
```bash
npx prisma migrate status
```

**Option 2: Open Prisma Studio (visual database viewer)**
```bash
npx prisma studio
```

This opens a browser window. Navigate to the `User` table and verify:
- `chatgptUserId` column exists
- `chatgptConnectedAt` column exists

### 3.6 Common Migration Issues

**Issue:** "Environment variable not found: DATABASE_URL"
- **Solution:** Make sure `DATABASE_URL` is in your `.env` file
- **Solution:** Format: `postgresql://user:password@host:port/database`

**Issue:** "Migration already applied"
- **Solution:** This is fine! The migration already ran. Continue to next step.

**Issue:** "Database connection failed"
- **Solution:** Verify database is accessible
- **Solution:** Check connection string format
- **Solution:** Test connection: `psql $DATABASE_URL` (if psql is installed)

**Issue:** "Migration file not found"
- **Solution:** The migration file should be at: `prisma/migrations/20251201000000_add_chatgpt_fields/migration.sql`
- **Solution:** If missing, check git status to ensure files are committed

---

## 4. OpenAI Platform Configuration

### 4.1 Access OpenAI Platform

1. Go to **https://platform.openai.com**
2. Sign in with your OpenAI account
3. Navigate to **ChatGPT Apps** or **GPTs** section
4. **Create a new app** or **edit existing one**

### 4.2 Configure OAuth Settings

In your ChatGPT app settings, find **OAuth** or **Authentication** section.

**Set these URLs:**

| Field | URL |
|-------|-----|
| **Authorization URL** | `https://analyticsassistant.ai/api/chatgpt/oauth/authorize` |
| **Token URL** | `https://analyticsassistant.ai/api/chatgpt/oauth/token` |
| **Userinfo URL** | `https://analyticsassistant.ai/api/chatgpt/oauth/user` |
| **Redirect URI** | `https://analyticsassistant.ai/api/chatgpt/oauth/callback` |

**For local testing, use:**
- `http://localhost:3000/api/chatgpt/oauth/authorize`
- `http://localhost:3000/api/chatgpt/oauth/token`
- `http://localhost:3000/api/chatgpt/oauth/user`
- `http://localhost:3000/api/chatgpt/oauth/callback`

### 4.3 Generate Your OAuth Credentials

**IMPORTANT:** OpenAI does NOT issue you credentials. You generate them yourself!

**Generate credentials:**
```bash
node scripts/generate-chatgpt-credentials.js
```

This will output:
```
CHATGPT_CLIENT_ID=...
CHATGPT_CLIENT_SECRET=...
```

**Save these values - you'll need them in two places!**

### 4.4 Update Environment Variables

**Add to your `.env` file:**

```bash
# ChatGPT OAuth (you generated these)
CHATGPT_CLIENT_ID=paste_generated_client_id_here
CHATGPT_CLIENT_SECRET=paste_generated_client_secret_here

# ChatGPT callback origins allowlist
CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com
```

**Important:**
- No quotes around values
- No extra spaces
- Save the file
- **These same values go in GPT Editor too!**

### 4.5 Upload OpenAPI Specification

1. In your ChatGPT app, find **Actions** or **API** section
2. Look for **OpenAPI Schema** or **API Specification**
3. **Upload the file:** `web/pages/api/chatgpt/openapi.json`
4. **Save** the configuration

**Verify the file exists:**
```bash
ls -la web/pages/api/chatgpt/openapi.json
```

### 4.6 Test OAuth Configuration

**After saving, test the authorization endpoint:**

```bash
# Replace YOUR_CLIENT_ID with your actual client ID
curl "https://analyticsassistant.ai/api/chatgpt/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://analyticsassistant.ai/api/chatgpt/oauth/callback&response_type=code"
```

**Expected:** HTTP 302 redirect with `code` parameter

**If you get an error:**
- Check that endpoints are deployed
- Verify client_id matches OpenAI platform
- Check Vercel logs for errors

---

## 5. Local Testing

### 5.1 Start Development Server

```bash
cd web
npm run dev
```

**Server should start on:** `http://localhost:3000`

### 5.2 Verify Environment Variables Loaded

```bash
# In a new terminal, from project root
node scripts/verify-env-vars.js
```

All required variables should show ✅

### 5.3 Test OAuth Endpoints

**⚠️ IMPORTANT: Cannot test with localhost!**

ChatGPT cannot call `http://localhost:3000`. You need a **public URL** for testing.

**Options:**
1. **Vercel Preview** (recommended) - push to branch, get preview URL
2. **ngrok** - `ngrok http 3000`
3. **Cloudflare Tunnel** - `cloudflared tunnel --url http://localhost:3000`

**After deploying to public URL, test:**

**Test 1: Authorization** (simulate ChatGPT's request)
```bash
curl "https://your-public-url.com/api/chatgpt/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://chat.openai.com/aip/test/oauth/callback&response_type=code"
```

**Test 2: Token Exchange**
```bash
curl -X POST https://your-public-url.com/api/chatgpt/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "CODE_FROM_TEST_1",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "chatgpt_user_id": "test_user_123",
    "email": "test@example.com"
  }'
```

**Best way to test:** Configure GPT in ChatGPT and test the full flow there!

### 5.4 Verify Web App Still Works

**Critical:** Make sure existing web app wasn't affected.

1. Visit `http://localhost:3000`
2. Test login/logout
3. Test GA4 connection
4. Test existing endpoints:
   - `/api/ga4/query`
   - `/api/ga4/properties`
   - `/api/insights/summarise`

**If anything is broken:**
- Check git diff to see what changed
- Verify ChatGPT code is isolated (under `/api/chatgpt/`)
- Check Vercel logs

### 5.5 Test Usage Tracking Isolation

**Verify usage keys are separate:**

- Web app: `usage:user:email:2024-12`
- ChatGPT: `usage:chatgpt:user:email:2024-12`

**Check KV storage** (if you have access):
- Web GA4 tokens: `ga4_tokens:<session_id>`
- ChatGPT GA4 tokens: `chatgpt_ga4_tokens:<chatgptUserId>`

---

## 6. Production Deployment

### 6.1 Commit Your Changes

```bash
# From project root
git add .
git status  # Review what will be committed

git commit -m "Add ChatGPT integration with OAuth, premium checks, and upgrade messaging"

git push origin chatgpt-user
```

### 6.2 Set Environment Variables in Vercel

1. Go to **Vercel Dashboard** → Your Project
2. **Settings** → **Environment Variables**
3. **Add these variables** (for **Production**, **Preview**, and **Development**):

```
CHATGPT_CLIENT_ID=your_production_client_id
CHATGPT_CLIENT_SECRET=your_production_client_secret
CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback
PREMIUM_URL=https://analyticsassistant.ai/premium
```

**Important:**
- Use your **production domain** in `CHATGPT_REDIRECT_URI`
- Make sure `CHATGPT_CLIENT_ID` and `CHATGPT_CLIENT_SECRET` match what's in OpenAI platform
- Set for all environments (Production, Preview, Development)

### 6.3 Deploy

**Option A: Automatic (if connected to Git)**
- Vercel will auto-deploy when you push
- Check **Deployments** tab for status

**Option B: Manual**
- **Deployments** → **Redeploy** (latest deployment)
- Or trigger new deployment from branch

### 6.4 Run Migration in Production

**After deployment, run the migration:**

**Option 1: Via Vercel CLI**
```bash
# Install Vercel CLI if needed
npm i -g vercel

# Pull production env vars
vercel env pull .env.production

# Run migration
export DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-)
npx prisma migrate deploy
```

**Option 2: Via Database Console**
1. Connect to your production database
2. Run the SQL from `prisma/migrations/20251201000000_add_chatgpt_fields/migration.sql`:

```sql
ALTER TABLE "User"
ADD COLUMN "chatgptUserId" TEXT,
ADD COLUMN "chatgptConnectedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_chatgptUserId_key" ON "User"("chatgptUserId");
```

**Option 3: Via Prisma Migrate (if database is accessible)**
```bash
# Set DATABASE_URL to production
export DATABASE_URL="your_production_database_url"
npx prisma migrate deploy
```

### 6.5 Verify Production Endpoints

**Test production endpoints:**

```bash
# Authorization
curl "https://analyticsassistant.ai/api/chatgpt/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://analyticsassistant.ai/api/chatgpt/oauth/callback&response_type=code"

# Status (requires auth token)
curl https://analyticsassistant.ai/api/chatgpt/v1/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Check Vercel logs** for any errors:
- **Deployments** → Click deployment → **Functions** → Check logs

---

## 7. Verification & Testing

### 7.1 Complete Checklist

Run through this checklist:

```bash
# 1. Environment variables
node scripts/verify-env-vars.js

# 2. Migration status
node scripts/check-migration-status.js

# 3. OAuth endpoints (use test script)
node scripts/test-oauth-endpoints.js

# 4. Web app isolation
node scripts/test-web-app-isolation.js
```

### 7.2 Test in ChatGPT

1. **Open your ChatGPT app** in ChatGPT interface
2. **User should be prompted to authorize**
3. **After authorization, test:**
   - "What's my connection status?"
   - "Connect my Google Analytics"
   - "Show me my traffic for the last 7 days"
   - "Summarize my analytics data"

### 7.3 Verify Premium Messaging

**Test as free user:**
- Should see upgrade prompts when limits reached
- Upgrade links should point to `https://analyticsassistant.ai/premium`

**Test as premium user:**
- Should not see upgrade prompts
- Should have higher limits

### 7.4 Monitor Usage

**Check Vercel logs:**
- Look for ChatGPT endpoint calls
- Verify usage tracking is working
- Check for errors

**Check KV storage** (if accessible):
- Verify usage keys: `usage:chatgpt:user:email:2024-12`
- Verify tokens: `chatgpt_token:*`, `chatgpt_ga4_tokens:*`

---

## 8. Troubleshooting

### 8.1 Migration Issues

**Error: "Environment variable not found: DATABASE_URL"**
- ✅ Add `DATABASE_URL` to `.env` file
- ✅ Format: `postgresql://user:password@host:port/database`
- ✅ Restart terminal/process after adding

**Error: "Migration already applied"**
- ✅ This is fine! Migration already ran. Continue to next step.

**Error: "Database connection failed"**
- ✅ Verify database is accessible
- ✅ Check connection string format
- ✅ Test: `psql $DATABASE_URL` (if psql installed)
- ✅ Check firewall/network settings

**Error: "Migration file not found"**
- ✅ Check: `prisma/migrations/20251201000000_add_chatgpt_fields/migration.sql` exists
- ✅ Run: `git status` to see if files are committed

### 8.2 OAuth Issues

**Error: "invalid_client"**
- ✅ Verify `CHATGPT_CLIENT_ID` matches OpenAI platform
- ✅ Verify `CHATGPT_CLIENT_SECRET` matches OpenAI platform
- ✅ Check no extra spaces/quotes in env vars
- ✅ Restart dev server after changing env vars

**Error: "chatgpt_user_id is required"**
- ✅ ChatGPT should provide this in token exchange
- ✅ If testing manually, include `chatgpt_user_id` in request body
- ✅ Check token endpoint logs

**Error: "invalid_token"**
- ✅ Token may be expired (tokens last 1 hour)
- ✅ Get a new token via authorization flow
- ✅ Check token is stored in KV: `chatgpt_token:*`

**Error: "Redirect URI mismatch"**
- ✅ Verify redirect URI in request matches OpenAI platform
- ✅ Check `CHATGPT_REDIRECT_URI` env var matches

### 8.3 Endpoint Issues

**Error: "404 Not Found"**
- ✅ Verify endpoints are deployed
- ✅ Check file paths: `web/pages/api/chatgpt/oauth/authorize.js`
- ✅ Verify Next.js routing is working

**Error: "500 Internal Server Error"**
- ✅ Check Vercel function logs
- ✅ Verify environment variables are set
- ✅ Check database connection
- ✅ Verify KV storage is accessible

**Error: "ChatGPT authentication required"**
- ✅ Include `Authorization: Bearer <token>` header
- ✅ Verify token is valid (not expired)
- ✅ Check token was stored correctly

### 8.4 Web App Isolation Issues

**Web app endpoints broken:**
- ✅ Check git diff - no ChatGPT code should be in web app files
- ✅ Verify web app uses `getBearerForRequest` from `ga4-session.js`
- ✅ Check ChatGPT code is under `/api/chatgpt/` only
- ✅ Verify usage tracking keys are separate

**Web app usage tracking affected:**
- ✅ Web keys: `usage:user:email:2024-12`
- ✅ ChatGPT keys: `usage:chatgpt:user:email:2024-12`
- ✅ They should be completely separate

### 8.5 ChatGPT App Issues

**ChatGPT can't call endpoints:**
- ✅ Verify OpenAPI spec is uploaded correctly
- ✅ Check endpoints are accessible (test with curl)
- ✅ Verify OAuth is configured correctly
- ✅ Check Vercel logs for errors

**ChatGPT shows "Authentication failed":**
- ✅ Verify OAuth URLs in OpenAI match your domain
- ✅ Check client ID/secret match
- ✅ Test OAuth flow manually

**ChatGPT shows "API error":**
- ✅ Check Vercel function logs
- ✅ Verify all environment variables are set
- ✅ Test endpoints manually

### 8.6 Getting Help

**If you're stuck:**
1. Check Vercel function logs
2. Verify environment variables
3. Test endpoints manually with curl
4. Check database migration status
5. Verify KV storage is working
6. Review git diff to see what changed

**Common fixes:**
- Restart dev server after changing env vars
- Clear KV cache if tokens are stale
- Re-run migration if database is out of sync
- Check OpenAI platform OAuth settings match your domain

---

## ✅ Final Checklist

Before considering setup complete:

- [ ] Database migration ran successfully
- [ ] Prisma client generated
- [ ] Environment variables set (local and production)
- [ ] ChatGPT app configured in OpenAI
- [ ] OAuth endpoints tested and working
- [ ] OpenAPI spec uploaded to ChatGPT app
- [ ] Web app still works (isolation verified)
- [ ] Production deployment successful
- [ ] Migration ran in production
- [ ] End-to-end flow tested in ChatGPT
- [ ] Premium messaging works (free vs premium)
- [ ] Usage tracking is separate (web vs ChatGPT)

---

## 🎯 Next Steps

After setup is complete:

1. **Monitor Usage:**
   - Check Vercel logs for ChatGPT endpoint calls
   - Monitor KV storage for usage tracking
   - Watch for errors in production

2. **Gather Feedback:**
   - Test with real ChatGPT users
   - Monitor upgrade conversion rates
   - Track which endpoints are most used

3. **Iterate:**
   - Add more ChatGPT endpoints if needed
   - Refine upgrade messaging based on feedback
   - Add analytics tracking for ChatGPT-specific metrics

---

**You're all set!** 🎉

If you need help with any step, refer back to the troubleshooting section or check the detailed error messages in Vercel logs.
