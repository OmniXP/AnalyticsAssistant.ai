# Deploy to Production and Test in ChatGPT

**Complete guide for deploying your ChatGPT integration and testing it.**

---

## 🚀 Step 1: Deploy to Production

### 1.1 Commit Your Changes

```bash
# From project root
cd /Users/simonwhitmore/Documents/GitHub/analyticsassistant-ai

# Check what will be committed
git status

# Add all changes
git add .

# Commit
git commit -m "Add ChatGPT integration with GPT Actions OAuth"

# Push to your branch
git push origin chatgpt-user
# Or if you're on main: git push origin main
```

### 1.2 Set Environment Variables in Vercel

1. **Go to Vercel Dashboard**
   - Navigate to: https://vercel.com/dashboard
   - Select your **analyticsassistant-ai** project

2. **Go to Settings → Environment Variables**

3. **Add these variables** (for **Production**, **Preview**, and **Development**):

   ```
   CHATGPT_CLIENT_ID=F_TGwQULu5Zke7rNdNnD4zCkRXMvRyN7
   CHATGPT_CLIENT_SECRET=G7SgsYg9CanopPif4qKU7GZyPipBXVMhyremLV5zLXI
   CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com
   GOOGLE_REDIRECT_URI=https://analyticsassistant.ai/api/auth/google/callback
   ```

   **Important:**
   - Use your **production domain** (`https://analyticsassistant.ai`)
   - Set for all environments (Production, Preview, Development)
   - Click **Save** after adding each variable

4. **Verify variables are set:**
   - You should see all 4 variables listed
   - Make sure they're enabled for Production

### 1.3 Deploy

**Option A: Automatic (if connected to Git)**
- Vercel will automatically deploy when you push
- Go to **Deployments** tab to see the deployment progress
- Wait for deployment to complete (usually 2-3 minutes)

**Option B: Manual**
- Go to **Deployments** tab
- Click **Redeploy** on the latest deployment
- Or trigger a new deployment from your branch

### 1.4 Run Database Migration in Production

After deployment, you need to run the migration on your production database.

**Option 1: Via Vercel CLI (Recommended)**

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Login to Vercel
vercel login

# Link to your project (if not already linked)
vercel link

# Pull production environment variables
vercel env pull .env.production

# Set DATABASE_URL from production env
export DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d '=' -f2-)

# Run migration
npx prisma migrate deploy
```

**Option 2: Via Database Console**

1. Connect to your production database (Neon, Supabase, etc.)
2. Run this SQL:

```sql
-- Add ChatGPT fields to User table
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "chatgptUserId" TEXT,
ADD COLUMN IF NOT EXISTS "chatgptConnectedAt" TIMESTAMP(3);

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS "User_chatgptUserId_key" ON "User"("chatgptUserId");
```

**Option 3: Via Prisma Migrate (if database is accessible)**

```bash
# Set production DATABASE_URL
export DATABASE_URL="your_production_database_url"

# Run migration
npx prisma migrate deploy
```

### 1.5 Verify Deployment

**Check deployment logs:**
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on the latest deployment
3. Check **Functions** tab for any errors
4. Look for successful builds

**Test endpoints are accessible:**
```bash
# Test authorization endpoint
curl "https://analyticsassistant.ai/api/chatgpt/oauth/authorize?client_id=F_TGwQULu5Zke7rNdNnD4zCkRXMvRyN7&redirect_uri=https://chat.openai.com/aip/test/oauth/callback&response_type=code"

# Should return: HTTP 302 redirect (or 400 if redirect_uri doesn't match allowlist)
```

---

## 🤖 Step 2: Configure GPT in ChatGPT

### 2.1 Access GPT Editor

1. **Go to ChatGPT**
   - Visit: https://chat.openai.com
   - Sign in with your account

2. **Navigate to GPTs**
   - Click **Explore** → **GPTs** (or **My GPTs**)
   - Click **Create** (or edit existing GPT)

### 2.2 Configure Basic Settings

1. **Name your GPT** (e.g., "Analytics Assistant")
2. **Add description** (e.g., "Get insights from your Google Analytics data")
3. **Add instructions** (optional, e.g., "Help users analyze their GA4 data")

### 2.3 Upload OpenAPI Schema

1. **Go to Actions tab**
2. **Click "Create new action"** or **"Import from URL"**
3. **Upload the file:**
   - File: `web/pages/api/chatgpt/openapi.json`
   - Or paste the URL if hosted: `https://analyticsassistant.ai/api/chatgpt/openapi.json`
4. **Save**

### 2.4 Configure OAuth Authentication

1. **In Actions tab, find Authentication section**
2. **Select "OAuth"**
3. **Fill in these values:**

   | Field | Value |
   |-------|-------|
   | **Authorization URL** | `https://analyticsassistant.ai/api/chatgpt/oauth/authorize` |
   | **Token URL** | `https://analyticsassistant.ai/api/chatgpt/oauth/token` |
   | **Scope** | `ga4.read` (or leave empty) |
   | **Client ID** | `F_TGwQULu5Zke7rNdNnD4zCkRXMvRyN7` |
   | **Client Secret** | `G7SgsYg9CanopPif4qKU7GZyPipBXVMhyremLV5zLXI` |

4. **Important:** 
   - Use the **SAME** Client ID and Secret as in your `.env` file
   - ChatGPT will show you a callback URL - that's normal, you don't need to set it

5. **Save** the authentication settings

### 2.5 Save Your GPT

1. Click **Save** (top right)
2. Choose visibility:
   - **Only me** (for testing)
   - **Anyone with a link** (for sharing)
   - **Public** (for public listing)

---

## 🧪 Step 3: Test in ChatGPT

### 3.1 Start a New Chat

1. **Open your GPT** in ChatGPT
2. **Start a new conversation**

### 3.2 Test Authorization Flow

**First interaction:**
- ChatGPT should prompt you to authorize
- Click **Authorize** or **Connect**
- You'll be redirected to your authorization endpoint
- After authorization, you'll be redirected back to ChatGPT

**Expected behavior:**
- ✅ Authorization prompt appears
- ✅ Redirect to your server works
- ✅ Redirect back to ChatGPT works
- ✅ Authorization completes successfully

### 3.3 Test API Endpoints

**Test 1: Check Status**
```
What's my connection status?
```

**Expected response:**
- Shows your email, premium status, GA4 connection status
- May prompt to connect GA4 if not connected

**Test 2: Connect GA4**
```
Connect my Google Analytics account
```

**Expected behavior:**
- Provides a URL to connect GA4
- After connecting, GA4 should be linked

**Test 3: Query GA4 Data**
```
Show me my traffic for the last 7 days
```

**Expected response:**
- Returns GA4 data (sessions, users, etc.)
- Or prompts to connect GA4 if not connected

**Test 4: Get AI Summary**
```
Summarize my analytics data for this month
```

**Expected response:**
- Returns AI-generated summary
- Or shows upgrade message if on free plan and limit reached

### 3.4 Test Premium Features

**If you have a premium account:**
- Test that premium features work
- Verify no upgrade prompts appear

**If you're on free plan:**
- Test that limits are enforced
- Verify upgrade messages appear when limits reached
- Check that upgrade links work

---

## ✅ Step 4: Verification Checklist

### Deployment Verification

- [ ] Code pushed to Git
- [ ] Vercel deployment successful
- [ ] Environment variables set in Vercel
- [ ] Database migration ran in production
- [ ] Endpoints accessible (test with curl)

### GPT Configuration Verification

- [ ] GPT created/edited in ChatGPT
- [ ] OpenAPI schema uploaded
- [ ] OAuth configured with correct URLs
- [ ] Client ID and Secret match `.env` file
- [ ] GPT saved and accessible

### Functionality Verification

- [ ] Authorization flow works
- [ ] User can authorize successfully
- [ ] Status endpoint returns correct data
- [ ] GA4 connection flow works
- [ ] GA4 queries return data
- [ ] AI summaries work
- [ ] Premium checks work correctly
- [ ] Upgrade messages appear when appropriate

### Error Handling Verification

- [ ] Invalid tokens return proper errors
- [ ] Missing GA4 connection shows helpful message
- [ ] Rate limits show upgrade prompts
- [ ] All errors are user-friendly

---

## 🐛 Troubleshooting

### Authorization Fails

**Issue:** "Invalid redirect_uri" error

**Solution:**
- Check `CHATGPT_REDIRECT_URI_ALLOWLIST` includes `https://chat.openai.com` and `https://chatgpt.com`
- Verify allowlist is set in Vercel environment variables
- Check Vercel function logs for exact redirect_uri being used

**Issue:** "Invalid client" error

**Solution:**
- Verify Client ID and Secret match in both `.env` and GPT Editor
- Check for extra spaces or quotes
- Ensure values are set in Vercel environment variables

### Endpoints Return 404

**Issue:** Endpoints not found

**Solution:**
- Verify files are deployed: `web/pages/api/chatgpt/oauth/authorize.js` exists
- Check Vercel build logs for errors
- Ensure Next.js routing is working

### Database Errors

**Issue:** "User not found" or migration errors

**Solution:**
- Verify migration ran in production
- Check `chatgptUserId` column exists in User table
- Check Vercel function logs for database errors

### GA4 Connection Issues

**Issue:** Can't connect GA4

**Solution:**
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Check `GOOGLE_REDIRECT_URI` is correct
- Verify Google OAuth callback endpoint works

---

## 📊 Monitoring

### Check Vercel Logs

1. Go to Vercel Dashboard → Your Project
2. Click **Functions** tab
3. Select a function (e.g., `/api/chatgpt/oauth/authorize`)
4. View **Logs** to see requests and errors

### Monitor Usage

- Check KV storage for usage tracking
- Look for keys: `usage:chatgpt:user:email:2024-12`
- Monitor rate limit hits

### Track Errors

- Set up error monitoring (Sentry, etc.)
- Watch for 500 errors in Vercel logs
- Monitor database connection issues

---

## 🎉 Success Criteria

You'll know everything is working when:

- ✅ Users can authorize in ChatGPT
- ✅ GA4 connection flow works
- ✅ Queries return data
- ✅ AI summaries generate correctly
- ✅ Premium checks work
- ✅ Upgrade messages appear appropriately
- ✅ No errors in Vercel logs

---

## 🚀 Next Steps After Testing

1. **Gather Feedback**
   - Test with real users
   - Monitor usage patterns
   - Collect feedback on UX

2. **Iterate**
   - Add more endpoints if needed
   - Refine upgrade messaging
   - Improve error messages

3. **Scale**
   - Monitor performance
   - Optimize database queries
   - Add caching if needed

---

**You're ready to deploy and test!** 🎉

Follow the steps above, and you'll have your ChatGPT integration live and working.
