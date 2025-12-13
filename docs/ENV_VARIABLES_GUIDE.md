# Environment Variables Guide

**Complete guide to setting up all required environment variables for the ChatGPT integration.**

---

## 📋 Missing Variables Explanation

Based on your verification output, you're missing 4 variables. Here's what each one is for and how to set them:

---

## 1. CHATGPT_CLIENT_ID

**What it is:** Your OAuth client ID that YOU generate (not from OpenAI).

**How to generate it:**
```bash
node scripts/generate-chatgpt-credentials.js
```

**When to set it:** Now (generate and add immediately)

**Important:** You'll enter the SAME value in:
- Your `.env` file
- GPT Editor → Actions → Authentication → OAuth

**Example:**
```bash
CHATGPT_CLIENT_ID=rNc-glA172S7hvGpPLvh72xM-WWMta8o
```

---

## 2. CHATGPT_CLIENT_SECRET

**What it is:** Your OAuth client secret that YOU generate (not from OpenAI).

**How to generate it:**
```bash
node scripts/generate-chatgpt-credentials.js
```

**When to set it:** Now (generate and add immediately)

**Important:** You'll enter the SAME value in:
- Your `.env` file
- GPT Editor → Actions → Authentication → OAuth

**Example:**
```bash
CHATGPT_CLIENT_SECRET=oiFy5HBhjH9ywQVQzg5o2sX7bvr-oBfTsUARHGGEBTA
```

---

## 3. CHATGPT_REDIRECT_URI_ALLOWLIST

**What it is:** Comma-separated list of ChatGPT callback origins to allow.

**What to set it to:**
```bash
CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com
```

**When to set it:** Now (set immediately)

**Important:** 
- ChatGPT provides the full callback URL dynamically
- Your server validates the origin against this allowlist
- This is NOT a fixed redirect URI

**Example:**
```bash
CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com
```

---

## 4. GOOGLE_REDIRECT_URI

**What it is:** The OAuth redirect URI for Google Analytics OAuth flow (used by your existing web app).

**What to set it to:**
- **Production:** `https://analyticsassistant.ai/api/auth/google/callback`
- **Local testing:** `http://localhost:3000/api/auth/google/callback`

**When to set it:** Now (if not already set)

**Note:** This has a default fallback, but it's better to set it explicitly.

**Example:**
```bash
GOOGLE_REDIRECT_URI=https://analyticsassistant.ai/api/auth/google/callback
```

---

## 📝 How to Add These Variables

### Step 1: Open Your .env File

Your `.env.local` file is located at:
```
web/.env.local
```

### Step 2: Generate Credentials

```bash
node scripts/generate-chatgpt-credentials.js
```

Copy the output values.

### Step 3: Add the Variables

Add these lines to your `web/.env.local` file:

```bash
# ============================================
# ChatGPT Integration Variables
# ============================================

# ChatGPT OAuth (you generated these)
CHATGPT_CLIENT_ID=paste_generated_client_id_here
CHATGPT_CLIENT_SECRET=paste_generated_client_secret_here

# ChatGPT callback origins allowlist
CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com

# Google OAuth (for GA4)
GOOGLE_REDIRECT_URI=https://analyticsassistant.ai/api/auth/google/callback
```

**Important:** Use the SAME `CHATGPT_CLIENT_ID` and `CHATGPT_CLIENT_SECRET` values in GPT Editor!

---

## ✅ Verification

After adding the variables, verify they're set:

```bash
node scripts/verify-env-vars.js
```

**Expected:** All 4 variables should now show ✅

---

## 🎯 Quick Setup Checklist

- [ ] Open `web/.env.local`
- [ ] Add `CHATGPT_REDIRECT_URI` (set to production URL)
- [ ] Add `GOOGLE_REDIRECT_URI` (set to production URL)
- [ ] Add `CHATGPT_CLIENT_ID=placeholder_for_now` (update after OpenAI setup)
- [ ] Add `CHATGPT_CLIENT_SECRET=placeholder_for_now` (update after OpenAI setup)
- [ ] Save the file
- [ ] Run `node scripts/verify-env-vars.js` to verify

---

## 🔄 For Local Development

If you're testing locally, you can use:

```bash
CHATGPT_REDIRECT_URI=http://localhost:3000/api/chatgpt/oauth/callback
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

**Important:** When you configure the ChatGPT app in OpenAI, make sure the redirect URI matches what you set here.

---

## 📚 Related Documentation

- **Complete Setup Guide:** `docs/COMPLETE_SETUP_GUIDE.md`
- **Quick Start:** `docs/QUICK_START_CHATGPT.md`
- **Environment Variables Reference:** `docs/chatgpt-setup.md`

---

## 🆘 Troubleshooting

**Issue:** Variables not showing up after adding them
- **Solution:** Make sure you saved the file
- **Solution:** Restart your dev server if it's running
- **Solution:** Check file is named exactly `.env.local` (no typos)

**Issue:** Not sure what URL to use
- **Production:** Use `https://analyticsassistant.ai`
- **Local:** Use `http://localhost:3000`
- **Staging:** Use your staging domain

**Issue:** GOOGLE_REDIRECT_URI already exists but script says it's missing
- **Solution:** Check the variable name is exactly `GOOGLE_REDIRECT_URI` (case-sensitive)
- **Solution:** Make sure there are no extra spaces or quotes

---

**Next Step:** After setting these variables, continue with the database migration and OpenAI platform configuration.
