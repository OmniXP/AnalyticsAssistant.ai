# ChatGPT Integration Setup Guide

Complete step-by-step guide to set up and deploy the ChatGPT app integration.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (via `DATABASE_URL`)
- Vercel account (for deployment)
- OpenAI ChatGPT app credentials (from OpenAI platform)

---

## Step 1: Run Database Migration

The migration adds `chatgptUserId` and `chatgptConnectedAt` fields to the User table.

### Local Development

```bash
cd /Users/simonwhitmore/Documents/GitHub/analyticsassistant-ai

# Run the migration
npx prisma migrate dev --name add_chatgpt_fields

# Generate Prisma client
npx prisma generate
```

### Production (Vercel)

The migration will run automatically on deployment if you've committed it. Alternatively:

```bash
# After deployment, run in Vercel CLI or via database console
npx prisma migrate deploy
```

**Verification:**
- Check that migration ran: `npx prisma migrate status`
- Verify schema: The User model should have `chatgptUserId` and `chatgptConnectedAt` fields
- Test: Existing web app endpoints should still work

---

## Step 2: Set Environment Variables

Add these to your `.env` file (local) and Vercel dashboard (production):

### Required for ChatGPT Integration

```bash
# ChatGPT OAuth credentials (from OpenAI platform)
CHATGPT_CLIENT_ID=your_chatgpt_client_id_here
CHATGPT_CLIENT_SECRET=your_chatgpt_client_secret_here
CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback

# Premium page URL (optional, defaults to https://analyticsassistant.ai/premium)
PREMIUM_URL=https://analyticsassistant.ai/premium
# OR
NEXT_PUBLIC_PREMIUM_URL=https://analyticsassistant.ai/premium
```

### Already Required (Verify These Exist)

```bash
# Google OAuth (for GA4)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://analyticsassistant.ai/api/auth/google/callback

# OpenAI (for AI summaries)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini

# Vercel KV / Upstash
UPSTASH_KV_REST_URL=your_upstash_url
UPSTASH_KV_REST_TOKEN=your_upstash_token

# Database
DATABASE_URL=your_postgresql_connection_string

# NextAuth
NEXTAUTH_URL=https://analyticsassistant.ai
NEXTAUTH_SECRET=your_nextauth_secret
```

---

## Step 3: Configure ChatGPT App in OpenAI

1. **Go to OpenAI Platform**
   - Navigate to https://platform.openai.com
   - Go to your ChatGPT app settings

2. **Set OAuth Configuration**
   - **Authorization URL**: `https://analyticsassistant.ai/api/chatgpt/oauth/authorize`
   - **Token URL**: `https://analyticsassistant.ai/api/chatgpt/oauth/token`
   - **Userinfo URL**: `https://analyticsassistant.ai/api/chatgpt/oauth/user`
   - **Redirect URI**: `https://analyticsassistant.ai/api/chatgpt/oauth/callback` (or your custom callback)

3. **Upload OpenAPI Specification**
   - File: `web/pages/api/chatgpt/openapi.json`
   - This tells ChatGPT what endpoints are available and how to call them

4. **Get Credentials**
   - Copy `Client ID` → set as `CHATGPT_CLIENT_ID`
   - Copy `Client Secret` → set as `CHATGPT_CLIENT_SECRET`
   - Verify redirect URI matches `CHATGPT_REDIRECT_URI`

---

## Step 4: Test the Integration

### 4.1 Test Database Migration

```bash
# Check migration status
npx prisma migrate status

# Verify schema
npx prisma studio  # Open Prisma Studio to view User table
```

### 4.2 Test OAuth Endpoints (Manual)

1. **Test Authorization Endpoint:**
   ```bash
   curl "https://analyticsassistant.ai/api/chatgpt/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://analyticsassistant.ai/api/chatgpt/oauth/callback&response_type=code"
   ```
   Should redirect with a `code` parameter.

2. **Test Token Exchange:**
   ```bash
   curl -X POST https://analyticsassistant.ai/api/chatgpt/oauth/token \
     -H "Content-Type: application/json" \
     -d '{
       "grant_type": "authorization_code",
       "code": "CODE_FROM_STEP_1",
       "client_id": "YOUR_CLIENT_ID",
       "client_secret": "YOUR_CLIENT_SECRET",
       "chatgpt_user_id": "test_user_123"
     }'
   ```
   Should return `access_token`.

3. **Test Userinfo:**
   ```bash
   curl https://analyticsassistant.ai/api/chatgpt/oauth/user \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```
   Should return user info with premium status and upgradeUrl.

### 4.3 Test API Endpoints

Use the test scripts as checklists:

```bash
node scripts/test-chatgpt-auth.js
node scripts/test-chatgpt-endpoints.js
node scripts/test-web-app-isolation.js
node scripts/test-chatgpt-oauth-flow.js
```

### 4.4 Verify Web App Isolation

**Critical:** Ensure web app still works:

1. Visit your web app: `https://analyticsassistant.ai`
2. Test existing endpoints:
   - `/api/ga4/query` - Should work normally
   - `/api/ga4/properties` - Should work normally
   - `/api/insights/summarise` - Should work normally
3. Verify usage tracking:
   - Web app usage keys: `usage:user:email:2024-12`
   - ChatGPT usage keys: `usage:chatgpt:user:email:2024-12`
   - They should be separate!

---

## Step 5: Deploy to Production

### 5.1 Commit and Push

```bash
git add .
git commit -m "Add ChatGPT integration with premium checks and upgrade messaging"
git push origin chatgpt-user
```

### 5.2 Set Environment Variables in Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add all new variables:
   - `CHATGPT_CLIENT_ID`
   - `CHATGPT_CLIENT_SECRET`
   - `CHATGPT_REDIRECT_URI`
   - `PREMIUM_URL` (optional)

### 5.3 Deploy

- Vercel will auto-deploy from your branch
- Or trigger manually: Vercel Dashboard → Deployments → Redeploy

### 5.4 Run Migration in Production

After deployment, run the migration:

```bash
# Via Vercel CLI
vercel env pull .env.production
npx prisma migrate deploy

# OR via Vercel database console
# Connect to your database and run the migration SQL manually
```

---

## Step 6: Configure ChatGPT App (Final Step)

1. **Update OAuth URLs in OpenAI Platform:**
   - Use your production domain: `https://analyticsassistant.ai`
   - Verify all three endpoints are accessible

2. **Test End-to-End Flow:**
   - In ChatGPT, try using your app
   - User should be prompted to authorize
   - After authorization, user should be able to connect GA4
   - Test a query: "Show me my traffic for the last 7 days"

3. **Verify Premium Messaging:**
   - Free users should see upgrade prompts when limits are reached
   - Premium users should not see upgrade prompts
   - All upgrade links should point to `https://analyticsassistant.ai/premium`

---

## Troubleshooting

### Migration Issues

**Error: "Migration already applied"**
- The migration may have already run. Check with `npx prisma migrate status`
- If fields already exist, migration will skip safely

**Error: "Database connection failed"**
- Verify `DATABASE_URL` is set correctly
- Check database is accessible from your network

### OAuth Issues

**Error: "invalid_client"**
- Verify `CHATGPT_CLIENT_ID` and `CHATGPT_CLIENT_SECRET` match OpenAI platform
- Check environment variables are set in Vercel

**Error: "chatgpt_user_id is required"**
- ChatGPT should provide this in token exchange
- If testing manually, include `chatgpt_user_id` in request body

### Token Storage Issues

**Error: "No bearer" or "Token not found"**
- Check Vercel KV is configured (`UPSTASH_KV_REST_URL` and `UPSTASH_KV_REST_TOKEN`)
- Verify KV keys are being created: `chatgpt_token:*`

### Web App Isolation Issues

**Web app endpoints broken:**
- Check that no ChatGPT code is imported in web app endpoints
- Verify web app still uses `getBearerForRequest` from `ga4-session.js`
- Check usage tracking keys are separate

---

## Verification Checklist

- [ ] Database migration ran successfully
- [ ] Prisma client generated (`npx prisma generate`)
- [ ] Environment variables set in `.env` and Vercel
- [ ] ChatGPT app configured in OpenAI platform
- [ ] OAuth endpoints return correct responses
- [ ] Web app endpoints still work
- [ ] ChatGPT endpoints require authentication
- [ ] Usage tracking is separate (check KV keys)
- [ ] Premium checks work (free vs premium users)
- [ ] Upgrade messages appear when limits reached
- [ ] Upgrade links point to correct URL
- [ ] GA4 connection flow works from ChatGPT

---

## Next Steps After Setup

1. **Monitor Usage:**
   - Check Vercel logs for ChatGPT endpoint calls
   - Monitor KV storage for usage tracking
   - Watch for errors in production

2. **Gather Feedback:**
   - Test with real ChatGPT users
   - Monitor upgrade conversion rates
   - Track which endpoints are most used

3. **Iterate:**
   - Add more ChatGPT endpoints if needed (timeseries, campaigns, etc.)
   - Refine upgrade messaging based on user feedback
   - Add analytics tracking for ChatGPT-specific metrics

---

## Support

If you encounter issues:
1. Check Vercel function logs
2. Verify environment variables are set
3. Test endpoints manually with curl
4. Check database migration status
5. Verify KV storage is working
