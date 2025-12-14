# ChatGPT System Prompt Setup Guide

**How to configure the new proactive system prompt for your ChatGPT app.**

---

## 🎯 What Changed

### New System Prompt
- ✅ Proactive: Automatically fetches GA4 data without asking
- ✅ No confirmations: Assumes user wants insights immediately
- ✅ Cached responses: Returns data instantly when available
- ✅ British English: Direct, data-led responses

### New Endpoint
- ✅ `/api/chatgpt/v1/insight` - Auto-fetches and summarises GA4 data
- ✅ Uses cached 28-day reports for instant responses
- ✅ Prefetches data after GA4 connection

---

## 📋 Implementation Steps

### Step 1: System Prompt in GPT Editor

**In ChatGPT GPT Editor:**

1. Go to **Configure** → **Instructions** (or **System Message**)
2. **Paste this system prompt:**

```
You are AnalyticsAssistant.ai — a Google Analytics 4 insights analyst.

Your job: give users *instant, data-driven answers* about their connected GA4 property without asking multiple confirmations.

Core behaviour:
- Always assume the user's GA4 property is connected.
- When a user asks for insights, immediately call the /api/chatgpt/v1/insight endpoint with the user's property ID.
- If GA4 data is cached, return it instantly.
- Only ask ONE question if a critical parameter is missing (like property selection).
- Never list what you will do; just do it and present results.
- Never ask "Run it?" or "Confirm". Assume yes.
- Never tell users to export GA4 data — you handle that via API.
- Keep responses concise, structured, and action-oriented.

Default report:
- Time period: last 28 days vs previous 28 days
- Metrics: sessions, users, purchases, conversion rate, revenue, AOV
- Dimensions: default channel group, landing page
- Output:
  1. One-sentence summary
  2. Key metrics table (with % change)
  3. Top 3 drivers
  4. Top 3–5 recommended actions (ranked by impact)

If GA4 is not connected, say:
"Let's get your GA4 connected — click below to connect Google Analytics. Once you're connected, I'll automatically fetch your latest 28-day summary."

Be direct, data-led, and use British English.
Avoid filler phrases, preambles, or repetitive confirmations.
```

3. **Save** the GPT configuration

---

### Step 2: Update OpenAPI Schema

**The new `/api/chatgpt/v1/insight` endpoint is already added to `openapi.json`.**

**Upload updated schema:**
1. Go to GPT Editor → **Actions**
2. **Upload:** `web/pages/api/chatgpt/openapi.json`
3. **Save**

---

### Step 3: Verify Code Changes

**Files created/updated:**
- ✅ `web/lib/server/chatgpt-config.js` - System prompt constant
- ✅ `web/lib/server/chatgpt-ga4-helpers.js` - Caching and auto-fetch helpers
- ✅ `web/pages/api/chatgpt/v1/insight.js` - New auto-fetch endpoint
- ✅ `web/pages/api/chatgpt/v1/summarise.js` - Updated to use new system prompt
- ✅ `web/pages/api/chatgpt/oauth/ga4/callback.js` - Added prefetch on connection

**All changes are committed and ready to deploy.**

---

## 🧪 Testing

### Test Auto-Fetch Endpoint

```bash
# After connecting GA4, test the insight endpoint
curl -X POST https://analyticsassistant.ai/api/chatgpt/v1/insight \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"propertyId": "properties/123456789"}'
```

**Expected:**
- Returns AI-generated insight immediately
- Uses cached data if available (<1s response)
- Fetches fresh data if cache expired

### Test in ChatGPT

1. **Connect GA4** via ChatGPT
2. **Ask:** "What are my insights?"
3. **Expected:** ChatGPT automatically calls `/insight` endpoint and returns summary
4. **No confirmations** - just instant insights

---

## ✅ Key Features

### 1. Automatic Data Fetching
- ChatGPT calls `/api/chatgpt/v1/insight` automatically
- No "Run it?" prompts
- Assumes user wants insights immediately

### 2. Caching
- 28-day reports cached for 6 hours
- Instant responses when cache hit
- Background prefetch after GA4 connection

### 3. Default Report
- Last 28 days vs previous 28 days
- Key metrics: sessions, users, purchases, revenue, AOV
- Top channels breakdown

### 4. Proactive Behaviour
- Never asks for confirmation
- Only asks ONE question if property missing
- Direct, actionable insights

---

## 📊 Response Format

**The `/insight` endpoint returns:**

```json
{
  "ok": true,
  "insight": "AI-generated summary...",
  "data": {
    "cached": true,
    "dateRange": {
      "current": { "start": "2024-11-14", "end": "2024-12-11" },
      "previous": { "start": "2024-10-17", "end": "2024-11-13" }
    },
    "totals": {
      "current": { "sessions": 1234, "users": 987, "purchases": 45, "revenue": 5678.90 },
      "previous": { "sessions": 1100, "users": 890, "purchases": 40, "revenue": 5000.00 }
    },
    "topChannels": [...]
  }
}
```

---

## 🎯 Result

**After this update:**

- ✅ User connects GA4 once
- ✅ Assistant immediately provides insights (no "run it" prompts)
- ✅ Cached data makes answers almost instant (<1s)
- ✅ Only question appears if GA4 isn't connected
- ✅ Output is concise, confident, and useful

---

## 📝 Notes

**Important:**
- System prompt goes in **GPT Editor**, not in code
- Code provides the `/insight` endpoint that auto-fetches data
- ChatGPT uses the system prompt to decide when to call endpoints
- Caching happens automatically in the background

**Architecture:**
- Uses `connectionId` (not `userId`) for token storage
- Caches by `connectionId` + `propertyId`
- Prefetches after GA4 connection for instant first response

---

**Your ChatGPT assistant is now proactive and data-driven!** 🎉
