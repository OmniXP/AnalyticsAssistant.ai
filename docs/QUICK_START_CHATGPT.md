# ChatGPT Integration - Quick Start Guide

**Follow these steps in order to complete the setup.**

---

## 🚀 Step-by-Step Execution

### Step 1: Verify Prerequisites

Make sure you have:
- ✅ Database connection string (`DATABASE_URL`)
- ✅ All existing environment variables set
- ✅ Access to OpenAI platform (platform.openai.com)

---

### Step 2: Set Up Environment Variables

#### 2.1 Check Your Current Environment

Your app needs `DATABASE_URL` to run migrations. Check if it's set:

```bash
# Check if DATABASE_URL is in your environment
echo $DATABASE_URL

# Or check your .env file location
# Usually in: web/.env.local or .env
```

#### 2.2 Add ChatGPT Variables

Add these to your `.env` file (create it if it doesn't exist):

**Location:** `web/.env.local` or `.env` in project root

```bash
# ChatGPT OAuth (you'll get these from OpenAI in Step 3)
CHATGPT_CLIENT_ID=your_client_id_here
CHATGPT_CLIENT_SECRET=your_client_secret_here
CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback

# Premium URL (optional)
PREMIUM_URL=https://analyticsassistant.ai/premium
```

**Note:** For now, you can use placeholder values. We'll update them after configuring the ChatGPT app.

---

### Step 3: Run Database Migration

**Before running:** Make sure `DATABASE_URL` is set in your environment.

```bash
# Navigate to project root
cd /Users/simonwhitmore/Documents/GitHub/analyticsassistant-ai

# Option 1: If DATABASE_URL is in .env file, Prisma will auto-load it
npx prisma migrate dev --name add_chatgpt_fields

# Option 2: If DATABASE_URL is not in .env, set it temporarily
export DATABASE_URL="your_postgresql_connection_string"
npx prisma migrate dev --name add_chatgpt_fields

# Generate Prisma client
npx prisma generate
```

**Expected output:**
```
✔ Migration `20251201000000_add_chatgpt_fields` applied successfully.
✔ Generated Prisma Client
```

**If you get an error about DATABASE_URL:**
1. Check your database connection string format: `postgresql://user:password@host:port/database`
2. Verify the database is accessible
3. Make sure the connection string is in your `.env` file

---

### Step 4: Configure ChatGPT App in OpenAI

#### 4.1 Access OpenAI Platform

1. Go to https://platform.openai.com
2. Sign in with your OpenAI account
3. Navigate to **ChatGPT Apps** or **GPTs**
4. Create a new app or edit existing one

#### 4.2 Set OAuth Configuration

In your ChatGPT app settings, find **OAuth** or **Authentication** section:

**Authorization URL:**
```
https://analyticsassistant.ai/api/chatgpt/oauth/authorize
```

**Token URL:**
```
https://analyticsassistant.ai/api/chatgpt/oauth/token
```

**Userinfo URL:**
```
https://analyticsassistant.ai/api/chatgpt/oauth/user
```

**Redirect URI:**
```
https://analyticsassistant.ai/api/chatgpt/oauth/callback
```

**Note for local testing:** You can use `http://localhost:3000` instead of `https://analyticsassistant.ai`

#### 4.3 Get Your Credentials

After saving OAuth settings, OpenAI will show:
- **Client ID** → Copy this
- **Client Secret** → Copy this

**Update your `.env` file:**
```bash
CHATGPT_CLIENT_ID=paste_client_id_here
CHATGPT_CLIENT_SECRET=paste_client_secret_here
```

#### 4.4 Upload OpenAPI Specification

1. In your ChatGPT app, find **Actions** or **API** section
2. Look for **OpenAPI Schema** or **API Specification**
3. Upload the file: `web/pages/api/chatgpt/openapi.json`
4. Save the configuration

---

### Step 5: Test Locally

#### 5.1 Start Development Server

```bash
cd web
npm run dev
```

Server should start on `http://localhost:3000`

#### 5.2 Verify Environment Variables

```bash
# From project root
node scripts/verify-env-vars.js
```

This will check all required variables and show what's missing.

#### 5.3 Test OAuth Endpoints

**Test Authorization:**
```bash
curl "http://localhost:3000/api/chatgpt/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/api/chatgpt/oauth/callback&response_type=code"
```

**Expected:** Redirect with `code` parameter

**Test Token Exchange:**
```bash
curl -X POST http://localhost:3000/api/chatgpt/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "CODE_FROM_ABOVE",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET",
    "chatgpt_user_id": "test_user_123",
    "email": "test@example.com"
  }'
```

**Expected:** `{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }`

**Test Userinfo:**
```bash
curl http://localhost:3000/api/chatgpt/oauth/user \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected:** User info with premium status

#### 5.4 Test API Endpoints

**Status endpoint:**
```bash
curl http://localhost:3000/api/chatgpt/v1/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Properties endpoint (requires GA4 connection):**
```bash
curl http://localhost:3000/api/chatgpt/v1/properties \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### Step 6: Verify Web App Still Works

**Critical:** Make sure your existing web app wasn't affected.

1. Visit your web app: `http://localhost:3000`
2. Test existing endpoints:
   - `/api/ga4/query`
   - `/api/ga4/properties`
   - `/api/insights/summarise`
3. Verify user login/logout still works

**If anything is broken:** Check that you didn't accidentally modify web app code. The ChatGPT integration should be completely isolated.

---

### Step 7: Deploy to Production

#### 7.1 Commit Your Changes

```bash
git add .
git commit -m "Add ChatGPT integration"
git push origin chatgpt-user
```

#### 7.2 Set Environment Variables in Vercel

1. Go to Vercel Dashboard → Your Project
2. **Settings** → **Environment Variables**
3. Add these (for **Production**, **Preview**, and **Development**):

```
CHATGPT_CLIENT_ID=your_production_client_id
CHATGPT_CLIENT_SECRET=your_production_client_secret
CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback
PREMIUM_URL=https://analyticsassistant.ai/premium
```

4. **Important:** Use your production domain in `CHATGPT_REDIRECT_URI`

#### 7.3 Deploy

Vercel will auto-deploy, or trigger manually:
- **Deployments** → **Redeploy**

#### 7.4 Run Migration in Production

After deployment:

```bash
# Option 1: Via Vercel CLI
vercel env pull .env.production
npx prisma migrate deploy

# Option 2: Via database console
# Connect to production database and run:
# ALTER TABLE "User" ADD COLUMN "chatgptUserId" TEXT;
# ALTER TABLE "User" ADD COLUMN "chatgptConnectedAt" TIMESTAMP(3);
# CREATE UNIQUE INDEX "User_chatgptUserId_key" ON "User"("chatgptUserId");
```

---

### Step 8: Test in ChatGPT

1. Open your ChatGPT app in ChatGPT interface
2. User should be prompted to authorize
3. After authorization, test:
   - "What's my connection status?"
   - "Connect my Google Analytics"
   - "Show me my traffic for the last 7 days"

---

## 🆘 Troubleshooting

### DATABASE_URL Not Found

**Error:** `Environment variable not found: DATABASE_URL`

**Solution:**
1. Create or edit `.env` file in project root or `web/` directory
2. Add: `DATABASE_URL=postgresql://user:password@host:port/database`
3. Verify connection string is correct
4. Try migration again

### Migration Fails

**Error:** Migration fails with database error

**Solution:**
1. Check database is accessible
2. Verify `DATABASE_URL` format is correct
3. Check database user has permissions
4. Try connecting to database directly to verify

### OAuth Errors

**Error:** `invalid_client` or `invalid_token`

**Solution:**
1. Verify `CHATGPT_CLIENT_ID` and `CHATGPT_CLIENT_SECRET` match OpenAI platform
2. Check environment variables are set correctly
3. Ensure no extra spaces or quotes in env vars
4. Verify OAuth URLs in OpenAI match your domain

### ChatGPT App Not Working

**Error:** ChatGPT can't call your endpoints

**Solution:**
1. Verify OpenAPI spec is uploaded correctly
2. Check endpoints are accessible (test with curl)
3. Verify OAuth is configured correctly
4. Check Vercel logs for errors

---

## ✅ Completion Checklist

Before considering setup complete:

- [ ] Database migration ran successfully
- [ ] Environment variables set (local and production)
- [ ] ChatGPT app configured in OpenAI
- [ ] OAuth endpoints tested and working
- [ ] Web app still works (isolation verified)
- [ ] Production deployment successful
- [ ] Migration ran in production
- [ ] End-to-end flow tested in ChatGPT

---

## 📚 Additional Resources

- **📖 Complete Detailed Guide**: `docs/COMPLETE_SETUP_GUIDE.md` - **START HERE for full expertise and troubleshooting**
- **🔍 Environment Verification**: `node scripts/verify-env-vars.js`
- **📊 Migration Status Check**: `node scripts/check-migration-status.js`
- **🧪 OAuth Testing Guide**: `node scripts/test-oauth-endpoints.js`
- **✅ Test Checklists**: `scripts/test-*.js`

---

## 🎯 Next Steps After Setup

1. Monitor usage in Vercel logs
2. Track ChatGPT-specific metrics
3. Gather user feedback
4. Iterate on features based on usage

---

**Need help?** Check `docs/COMPLETE_SETUP_GUIDE.md` for detailed troubleshooting.
