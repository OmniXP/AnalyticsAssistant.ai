# GPT Actions OAuth - Correct Implementation Guide

**This guide reflects the ACTUAL GPT Actions OAuth flow, not generic OAuth.**

---

## 🔑 Key Differences from Generic OAuth

### 1. Client ID/Secret: You Generate Them

**❌ WRONG:** "Get Client ID/Secret from OpenAI Platform"

**✅ CORRECT:** You generate these yourself (long random strings) and enter them in:
- Your `.env` file
- GPT Editor → Actions → Authentication → OAuth

OpenAI does NOT issue these to you. They're your credentials that you create.

### 2. Redirect URI: ChatGPT Provides It Dynamically

**❌ WRONG:** `CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback`

**✅ CORRECT:** ChatGPT sends `redirect_uri` in the `/authorize` request. You validate it against an allowlist of ChatGPT origins.

**Example allowlist:**
```bash
CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com
```

### 3. Testing: Must Use Public URL

**❌ WRONG:** "Test with localhost:3000"

**✅ CORRECT:** ChatGPT cannot call localhost. Use:
- Vercel preview URL
- ngrok tunnel
- Cloudflare Tunnel
- Any publicly reachable domain

---

## 🚀 Correct Setup Steps

### Step 1: Generate Your OAuth Credentials

```bash
node scripts/generate-chatgpt-credentials.js
```

This outputs:
```
CHATGPT_CLIENT_ID=rNc-glA172S7hvGpPLvh72xM-WWMta8o
CHATGPT_CLIENT_SECRET=oiFy5HBhjH9ywQVQzg5o2sX7bvr-oBfTsUARHGGEBTA
```

**Save these - you'll need them in two places!**

### Step 2: Add to .env File

Add to `web/.env.local`:

```bash
# ChatGPT OAuth (you generated these)
CHATGPT_CLIENT_ID=rNc-glA172S7hvGpPLvh72xM-WWMta8o
CHATGPT_CLIENT_SECRET=oiFy5HBhjH9ywQVQzg5o2sX7bvr-oBfTsUARHGGEBTA

# ChatGPT callback origins allowlist
CHATGPT_REDIRECT_URI_ALLOWLIST=https://chat.openai.com,https://chatgpt.com
```

### Step 3: Configure GPT in ChatGPT Editor

1. Go to **ChatGPT** → **Explore GPTs** → **Create** (or edit existing)
2. Go to **Configure** → **Actions**
3. Upload your OpenAPI schema: `web/pages/api/chatgpt/openapi.json`
4. Under **Authentication** → **OAuth**:
   - **Authorization URL:** `https://analyticsassistant.ai/api/chatgpt/oauth/authorize`
   - **Token URL:** `https://analyticsassistant.ai/api/chatgpt/oauth/token`
   - **Scope:** `ga4.read` (or your custom scope)
   - **Client ID:** `rNc-glA172S7hvGpPLvh72xM-WWMta8o` (same as .env)
   - **Client Secret:** `oiFy5HBhjH9ywQVQzg5o2sX7bvr-oBfTsUARHGGEBTA` (same as .env)
5. **Save**

**Important:** ChatGPT will show you a callback URL. Copy it and add its origin to your allowlist if needed (though `chat.openai.com` and `chatgpt.com` should cover most cases).

### Step 4: How It Works

1. **User authorizes in ChatGPT**
   - ChatGPT calls: `GET /api/chatgpt/oauth/authorize?client_id=...&redirect_uri=https://chat.openai.com/aip/.../oauth/callback&...`
   - Your server validates `redirect_uri` against allowlist
   - Your server generates auth code and redirects back to ChatGPT's `redirect_uri`

2. **Token exchange**
   - ChatGPT calls: `POST /api/chatgpt/oauth/token` with the code
   - Your server validates client credentials and returns access token

3. **API calls**
   - ChatGPT includes `Authorization: Bearer <token>` in API requests
   - Your server validates token and processes request

---

## 🔍 Code Implementation

### Authorize Endpoint (`/api/chatgpt/oauth/authorize`)

```javascript
// Validates redirect_uri against allowlist
function isValidRedirectUri(redirectUri) {
  const url = new URL(redirectUri);
  const origin = url.origin;
  
  // Check against allowlist
  return ALLOWLIST_ORIGINS.some(allowed => {
    const allowedUrl = new URL(allowed);
    return allowedUrl.origin === origin;
  });
}

// Then redirects back to ChatGPT's callback URL
res.writeHead(302, { Location: redirectUrl.toString() });
```

### Token Endpoint (`/api/chatgpt/oauth/token`)

```javascript
// Validates client credentials (you generated these)
if (client_id !== CHATGPT_CLIENT_ID || client_secret !== CHATGPT_CLIENT_SECRET) {
  return res.status(401).json({ error: "invalid_client" });
}
```

---

## ✅ Verification

Run the verification script:

```bash
node scripts/verify-env-vars.js
```

**Expected:**
- ✅ `CHATGPT_CLIENT_ID` set
- ✅ `CHATGPT_CLIENT_SECRET` set
- ✅ `CHATGPT_REDIRECT_URI_ALLOWLIST` set

---

## 🧪 Testing

### Cannot Test with Localhost

ChatGPT cannot call `http://localhost:3000`. You need a public URL.

### Options for Testing

1. **Vercel Preview** (Recommended)
   - Push to a branch
   - Vercel creates preview URL
   - Use that URL in GPT Editor

2. **ngrok**
   ```bash
   ngrok http 3000
   # Use the ngrok URL in GPT Editor
   ```

3. **Cloudflare Tunnel**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

### Testing Flow

1. Deploy to public URL
2. Configure GPT with public URL endpoints
3. Test authorization in ChatGPT
4. Verify API calls work

---

## 📚 References

- [OpenAI GPT Actions Documentation](https://platform.openai.com/docs/actions)
- [OpenAI OAuth Cookbook](https://cookbook.openai.com/examples/oauth_server)
- [OpenAI Platform Guide](https://platform.openai.com/docs/guides/actions)

---

## 🆘 Common Mistakes

### ❌ "Get credentials from OpenAI"
**✅ Generate them yourself**

### ❌ "Set fixed redirect URI"
**✅ Use allowlist, validate dynamically**

### ❌ "Test with localhost"
**✅ Use public URL (Vercel preview, ngrok, etc.)**

### ❌ "Different credentials in .env vs GPT Editor"
**✅ Use the SAME credentials in both places**

---

## 🎯 Quick Checklist

- [ ] Generated credentials: `node scripts/generate-chatgpt-credentials.js`
- [ ] Added to `.env`: `CHATGPT_CLIENT_ID`, `CHATGPT_CLIENT_SECRET`, `CHATGPT_REDIRECT_URI_ALLOWLIST`
- [ ] Configured GPT Editor with same credentials
- [ ] Set Authorization URL: `https://analyticsassistant.ai/api/chatgpt/oauth/authorize`
- [ ] Set Token URL: `https://analyticsassistant.ai/api/chatgpt/oauth/token`
- [ ] Uploaded OpenAPI schema
- [ ] Deployed to public URL (for testing)
- [ ] Tested authorization flow

---

**This is the correct way to implement GPT Actions OAuth!** 🎉
