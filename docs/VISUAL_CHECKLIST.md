# ChatGPT Integration - Visual Checklist

**Follow this checklist step-by-step. Check off each item as you complete it.**

---

## ✅ Phase 1: Preparation (5 min)

- [ ] **Verify prerequisites**
  - [ ] Node.js 18+ installed (`node --version`)
  - [ ] Database accessible
  - [ ] Git repository ready
  - [ ] Web app currently working

- [ ] **Navigate to project**
  ```bash
  cd /Users/simonwhitmore/Documents/GitHub/analyticsassistant-ai
  ```

---

## ✅ Phase 2: Environment Variables (5 min)

- [ ] **Locate .env file**
  - [ ] Check `web/.env.local` exists
  - [ ] Or create `.env` in project root

- [ ] **Add ChatGPT variables**
  ```bash
  CHATGPT_CLIENT_ID=placeholder
  CHATGPT_CLIENT_SECRET=placeholder
  CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback
  PREMIUM_URL=https://analyticsassistant.ai/premium
  ```

- [ ] **Verify all variables**
  ```bash
  node scripts/verify-env-vars.js
  ```
  - [ ] All required variables show ✅
  - [ ] ChatGPT variables can be placeholders for now

---

## ✅ Phase 3: Database Migration (5 min)

- [ ] **Check migration status**
  ```bash
  node scripts/check-migration-status.js
  ```

- [ ] **Run migration**
  ```bash
  npx prisma migrate dev --name add_chatgpt_fields
  ```
  - [ ] Migration applied successfully ✅
  - [ ] No errors

- [ ] **Generate Prisma client**
  ```bash
  npx prisma generate
  ```
  - [ ] Client generated ✅

- [ ] **Verify migration**
  ```bash
  npx prisma migrate status
  ```
  - [ ] Migration shows as applied
  - [ ] Or open Prisma Studio: `npx prisma studio`
  - [ ] Verify `User` table has `chatgptUserId` and `chatgptConnectedAt` columns

---

## ✅ Phase 4: OpenAI Platform (15 min)

- [ ] **Access OpenAI Platform**
  - [ ] Go to https://platform.openai.com
  - [ ] Sign in
  - [ ] Navigate to ChatGPT Apps / GPTs
  - [ ] Create new app or edit existing

- [ ] **Configure OAuth URLs**
  - [ ] Authorization: `https://analyticsassistant.ai/api/chatgpt/oauth/authorize`
  - [ ] Token: `https://analyticsassistant.ai/api/chatgpt/oauth/token`
  - [ ] Userinfo: `https://analyticsassistant.ai/api/chatgpt/oauth/user`
  - [ ] Redirect: `https://analyticsassistant.ai/api/chatgpt/oauth/callback`
  - [ ] Save settings

- [ ] **Get credentials**
  - [ ] Copy Client ID
  - [ ] Copy Client Secret
  - [ ] Update `.env` file with real values

- [ ] **Upload OpenAPI spec**
  - [ ] Find Actions/API section
  - [ ] Upload `web/pages/api/chatgpt/openapi.json`
  - [ ] Save configuration

---

## ✅ Phase 5: Local Testing (20 min)

- [ ] **Start dev server**
  ```bash
  cd web
  npm run dev
  ```
  - [ ] Server starts on http://localhost:3000
  - [ ] No errors in console

- [ ] **Test OAuth endpoints**
  ```bash
  node scripts/test-oauth-endpoints.js
  ```
  - [ ] Follow test commands in output
  - [ ] Authorization endpoint works
  - [ ] Token exchange works
  - [ ] Userinfo endpoint works
  - [ ] Status endpoint works

- [ ] **Verify web app isolation**
  - [ ] Visit http://localhost:3000
  - [ ] Test login/logout
  - [ ] Test GA4 connection
  - [ ] Test existing endpoints:
    - [ ] `/api/ga4/query`
    - [ ] `/api/ga4/properties`
    - [ ] `/api/insights/summarise`
  - [ ] Everything still works ✅

---

## ✅ Phase 6: Production Deployment (15 min)

- [ ] **Commit changes**
  ```bash
  git add .
  git commit -m "Add ChatGPT integration"
  git push origin chatgpt-user
  ```

- [ ] **Set Vercel environment variables**
  - [ ] Go to Vercel Dashboard → Project → Settings → Environment Variables
  - [ ] Add for Production, Preview, Development:
    - [ ] `CHATGPT_CLIENT_ID`
    - [ ] `CHATGPT_CLIENT_SECRET`
    - [ ] `CHATGPT_REDIRECT_URI`
    - [ ] `PREMIUM_URL`
  - [ ] Use production domain in redirect URI

- [ ] **Deploy**
  - [ ] Vercel auto-deploys, or
  - [ ] Manually trigger deployment
  - [ ] Wait for deployment to complete
  - [ ] Check deployment logs for errors

- [ ] **Run production migration**
  - [ ] Via Vercel CLI or database console
  - [ ] Run: `npx prisma migrate deploy`
  - [ ] Or run SQL manually
  - [ ] Verify migration succeeded

---

## ✅ Phase 7: Verification (15 min)

- [ ] **Test production endpoints**
  ```bash
  curl "https://analyticsassistant.ai/api/chatgpt/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://analyticsassistant.ai/api/chatgpt/oauth/callback&response_type=code"
  ```
  - [ ] Endpoints are accessible
  - [ ] No 404 or 500 errors

- [ ] **Test in ChatGPT**
  - [ ] Open your ChatGPT app
  - [ ] User prompted to authorize
  - [ ] Authorization succeeds
  - [ ] Test commands:
    - [ ] "What's my connection status?"
    - [ ] "Connect my Google Analytics"
    - [ ] "Show me my traffic for the last 7 days"
  - [ ] All commands work ✅

- [ ] **Verify premium messaging**
  - [ ] Test as free user
  - [ ] Upgrade prompts appear when limits reached
  - [ ] Upgrade links work
  - [ ] Test as premium user
  - [ ] No upgrade prompts shown

- [ ] **Check monitoring**
  - [ ] Vercel logs show ChatGPT endpoint calls
  - [ ] No errors in logs
  - [ ] Usage tracking working

---

## ✅ Final Verification

- [ ] **Complete checklist**
  - [ ] All phases above completed
  - [ ] All checkboxes checked
  - [ ] No errors in any step

- [ ] **Documentation reviewed**
  - [ ] Read `docs/COMPLETE_SETUP_GUIDE.md` for details
  - [ ] Understand troubleshooting section

- [ ] **Ready for users**
  - [ ] ChatGPT app is live
  - [ ] OAuth flow works
  - [ ] Premium checks work
  - [ ] Web app unaffected

---

## 🎉 Setup Complete!

**Next steps:**
1. Monitor usage in Vercel logs
2. Gather user feedback
3. Iterate on features

**Need help?** Check `docs/COMPLETE_SETUP_GUIDE.md` troubleshooting section.
