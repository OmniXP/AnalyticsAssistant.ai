# ChatGPT Integration - Master Setup Guide

**Welcome! This is your complete guide to setting up the ChatGPT integration for AnalyticsAssistant.ai.**

---

## 🎯 What This Integration Does

Your ChatGPT app will allow users to:
- ✅ Connect their Google Analytics account directly in ChatGPT
- ✅ Query GA4 data with natural language
- ✅ Get AI-powered insights and summaries
- ✅ Upgrade to premium for higher limits
- ✅ All while keeping web app completely separate

---

## 📚 Documentation Structure

We've created comprehensive guides for you:

### 1. **START HERE: Complete Setup Guide** 📖
   **File:** `docs/COMPLETE_SETUP_GUIDE.md`
   
   **What it includes:**
   - Detailed step-by-step instructions
   - Full troubleshooting section
   - Common issues and solutions
   - Production deployment guide
   - Verification steps
   
   **Use this when:** You want detailed guidance on every step

### 2. **Quick Reference: Quick Start** ⚡
   **File:** `docs/QUICK_START_CHATGPT.md`
   
   **What it includes:**
   - Condensed step-by-step
   - Essential commands
   - Quick troubleshooting
   
   **Use this when:** You want a faster overview

### 3. **Visual Checklist** ✅
   **File:** `docs/VISUAL_CHECKLIST.md`
   
   **What it includes:**
   - Checkbox-style checklist
   - Phase-by-phase breakdown
   - Easy to follow along
   
   **Use this when:** You want to track your progress visually

### 4. **Setup Summary** 📋
   **File:** `docs/SETUP_SUMMARY.md`
   
   **What it includes:**
   - High-level overview
   - Time estimates
   - Quick command reference
   
   **Use this when:** You want a quick overview before starting

---

## 🚀 Quick Start (5-Minute Overview)

### Step 1: Environment Variables
```bash
# Add to .env file
CHATGPT_CLIENT_ID=your_client_id
CHATGPT_CLIENT_SECRET=your_client_secret
CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback
```

### Step 2: Database Migration
```bash
npx prisma migrate dev --name add_chatgpt_fields
npx prisma generate
```

### Step 3: Configure OpenAI Platform
- Set OAuth URLs in ChatGPT app
- Get Client ID and Secret
- Upload OpenAPI spec

### Step 4: Test & Deploy
- Test locally
- Deploy to production
- Run migration in production

**Full details:** See `docs/COMPLETE_SETUP_GUIDE.md`

---

## 🛠️ Helper Scripts

We've created scripts to help you:

### Verify Environment Variables
```bash
node scripts/verify-env-vars.js
```
Shows which variables are set and which are missing.

### Check Migration Status
```bash
node scripts/check-migration-status.js
```
Verifies database migration status and schema.

### Test OAuth Endpoints
```bash
node scripts/test-oauth-endpoints.js
```
Provides curl commands for testing OAuth flow.

### Test Checklists
```bash
node scripts/test-chatgpt-auth.js
node scripts/test-chatgpt-endpoints.js
node scripts/test-web-app-isolation.js
node scripts/test-chatgpt-oauth-flow.js
```
Manual checklists for different aspects of testing.

---

## 📁 Key Files Created

### API Endpoints
- `web/pages/api/chatgpt/oauth/authorize.js` - OAuth authorization
- `web/pages/api/chatgpt/oauth/token.js` - Token exchange
- `web/pages/api/chatgpt/oauth/user.js` - User info
- `web/pages/api/chatgpt/oauth/ga4/start.js` - GA4 OAuth start
- `web/pages/api/chatgpt/oauth/ga4/callback.js` - GA4 OAuth callback
- `web/pages/api/chatgpt/v1/status.js` - Connection status
- `web/pages/api/chatgpt/v1/properties.js` - List GA4 properties
- `web/pages/api/chatgpt/v1/query.js` - Query GA4 data
- `web/pages/api/chatgpt/v1/summarise.js` - AI summaries
- `web/pages/api/chatgpt/openapi.json` - OpenAPI specification

### Server Libraries
- `web/lib/server/chatgpt-auth.js` - Authentication helpers
- `web/lib/server/chatgpt-usage.js` - Usage tracking and premium checks

### Database
- `prisma/migrations/20251201000000_add_chatgpt_fields/migration.sql` - Migration file
- `prisma/schema.prisma` - Updated schema with ChatGPT fields

### Documentation
- `docs/COMPLETE_SETUP_GUIDE.md` - Full setup guide
- `docs/QUICK_START_CHATGPT.md` - Quick start
- `docs/VISUAL_CHECKLIST.md` - Visual checklist
- `docs/SETUP_SUMMARY.md` - Setup summary
- `docs/chatgpt-setup.md` - Environment variables reference

---

## ⏱️ Time Estimates

- **Environment Setup:** 5 minutes
- **Database Migration:** 5 minutes
- **OpenAI Configuration:** 15 minutes
- **Local Testing:** 20 minutes
- **Production Deployment:** 15 minutes
- **Verification:** 15 minutes

**Total: ~1-1.5 hours**

---

## 🆘 Getting Help

### 1. Check Documentation
- Start with `docs/COMPLETE_SETUP_GUIDE.md`
- Check troubleshooting section
- Review error messages carefully

### 2. Run Verification Scripts
```bash
node scripts/verify-env-vars.js
node scripts/check-migration-status.js
```

### 3. Check Logs
- Vercel function logs
- Database connection
- KV storage access

### 4. Common Issues
- **Migration fails:** Check `DATABASE_URL` is set
- **OAuth errors:** Verify client ID/secret match OpenAI
- **Endpoints 404:** Check files are deployed
- **Web app broken:** Verify ChatGPT code is isolated

---

## ✅ Success Criteria

You'll know setup is complete when:

- ✅ Database migration ran successfully
- ✅ Environment variables set (local and production)
- ✅ ChatGPT app configured in OpenAI
- ✅ OAuth endpoints tested and working
- ✅ Web app still works (isolation verified)
- ✅ Production deployment successful
- ✅ End-to-end flow tested in ChatGPT
- ✅ Premium messaging works correctly

---

## 🎯 Recommended Reading Order

1. **Start:** `docs/SETUP_SUMMARY.md` (5 min overview)
2. **Follow:** `docs/VISUAL_CHECKLIST.md` (track progress)
3. **Reference:** `docs/COMPLETE_SETUP_GUIDE.md` (detailed help)
4. **Quick lookup:** `docs/QUICK_START_CHATGPT.md` (command reference)

---

## 🚦 Ready to Start?

1. **Open the complete guide:**
   ```bash
   open docs/COMPLETE_SETUP_GUIDE.md
   # Or
   cat docs/COMPLETE_SETUP_GUIDE.md
   ```

2. **Or follow the visual checklist:**
   ```bash
   open docs/VISUAL_CHECKLIST.md
   ```

3. **Run your first verification:**
   ```bash
   node scripts/verify-env-vars.js
   ```

---

## 📞 Next Steps After Setup

Once setup is complete:

1. **Monitor Usage**
   - Check Vercel logs for ChatGPT calls
   - Monitor usage tracking
   - Watch for errors

2. **Gather Feedback**
   - Test with real users
   - Monitor upgrade conversions
   - Track popular endpoints

3. **Iterate**
   - Add more endpoints if needed
   - Refine upgrade messaging
   - Improve user experience

---

**Good luck with your setup! 🎉**

If you get stuck, the troubleshooting section in `docs/COMPLETE_SETUP_GUIDE.md` has solutions for most common issues.
