# ConnectionId Migration - Changes Summary

**Summary of changes to use `connectionId` instead of `chatgpt_user_id` for GPT Actions OAuth.**

---

## ✅ Changes Made

### 1. Token Endpoint (`web/pages/api/chatgpt/oauth/token.js`)

**Changes:**
- ✅ Parse body safely (handles `application/x-www-form-urlencoded`)
- ✅ Removed requirement for `chatgpt_user_id`
- ✅ Generate `connectionId` (UUID) and store with token
- ✅ Return `token_type` as lowercase "bearer"

**Key Code:**
```javascript
const connectionId = crypto.randomUUID();
await kvSetJson(`chatgpt_token:${accessToken}`, {
  connectionId,
  scope: codeData.scope || null,
  expires: Date.now() + expiresIn * 1000,
}, expiresIn);
```

### 2. Auth Helpers (`web/lib/server/chatgpt-auth.js`)

**New Functions:**
- ✅ `getChatGPTConnectionIdFromRequest(req)` - Get connectionId from token
- ✅ `saveGA4TokensForConnection(connectionId, tokens)` - Store GA4 tokens by connectionId
- ✅ `getGA4TokensForConnection(connectionId)` - Get GA4 tokens by connectionId
- ✅ `getGA4BearerForConnection(connectionId)` - Get GA4 bearer with auto-refresh

**Updated:**
- ✅ `getChatGPTUserFromRequest(req)` - Now works with connectionId (falls back to user lookup)

**Legacy Support:**
- Kept old functions for backwards compatibility

### 3. GA4 Start Endpoint (`web/pages/api/chatgpt/oauth/ga4/start.js`)

**Changes:**
- ✅ Generate `connect_code` (short-lived, 10 minutes)
- ✅ Store `connect_code -> connectionId` mapping
- ✅ Use `connect_code` in callback URL (not connectionId, for security)

**Key Code:**
```javascript
const connectCode = crypto.randomBytes(16).toString("hex");
await kvSetJson(`chatgpt_ga4_connect:${connectCode}`, {
  connectionId,
  expires: Date.now() + 10 * 60 * 1000
}, 600);
```

### 4. GA4 Callback Endpoint (`web/pages/api/chatgpt/oauth/ga4/callback.js`)

**Changes:**
- ✅ Read `connect_code` from query params
- ✅ Resolve `connectionId` from `connect_code`
- ✅ Store GA4 tokens against `connectionId`
- ✅ Optionally store email with connection for user linking

**Key Code:**
```javascript
const connectData = await kvGetJson(`chatgpt_ga4_connect:${connect_code}`);
const connectionId = connectData.connectionId;
await saveGA4TokensForConnection(connectionId, tokens);
```

### 5. API Endpoints Updated

**All updated to use `connectionId`:**
- ✅ `/api/chatgpt/v1/status.js`
- ✅ `/api/chatgpt/v1/properties.js`
- ✅ `/api/chatgpt/v1/query.js`
- ✅ `/api/chatgpt/v1/summarise.js`

**Pattern:**
```javascript
const connectionId = await getChatGPTConnectionIdFromRequest(req);
const bearer = await getGA4BearerForConnection(connectionId);
// User lookup is optional (for premium checks)
const user = await getChatGPTUserFromRequest(req);
```

### 6. Setup Script (`scripts/setup-chatgpt-integration.sh`)

**Changes:**
- ✅ Removed legacy `CHATGPT_REDIRECT_URI` reference
- ✅ Updated to use `CHATGPT_REDIRECT_URI_ALLOWLIST`
- ✅ Updated instructions for GPT Editor (not OpenAI Platform)

---

## 🔑 Key Concepts

### ConnectionId
- Generated as UUID when token is issued
- Stored with access token in KV
- Used to identify ChatGPT auth sessions
- No user account required initially

### Connect Code
- Short-lived (10 minutes) code for GA4 OAuth flow
- Links GA4 callback to connectionId
- Prevents exposing connectionId in URLs
- One-time use

### User Linking (Optional)
- Email captured from Google OAuth
- Stored with connectionId for future linking
- Used for premium checks if user exists
- Not required for basic functionality

---

## 📋 Storage Keys

**New Keys:**
- `chatgpt_token:<accessToken>` → `{ connectionId, scope, expires }`
- `chatgpt_ga4_tokens:<connectionId>` → `{ access_token, refresh_token, expiry }`
- `chatgpt_ga4_connect:<connectCode>` → `{ connectionId, expires }`
- `chatgpt_connection:<connectionId>` → `{ email, linkedAt }` (optional)

**Legacy Keys (still supported):**
- `chatgpt_ga4_tokens:<chatgptUserId>` (for backwards compatibility)

---

## ✅ Benefits

1. **No User ID Required**
   - GPT Actions don't need to provide user ID
   - Works with standard OAuth flow

2. **More Secure**
   - ConnectionId not exposed in URLs
   - Connect code is short-lived

3. **Flexible**
   - User linking is optional
   - Premium checks work if user exists
   - Falls back gracefully if no user

4. **Standards Compliant**
   - Follows OAuth 2.0 spec
   - Handles `application/x-www-form-urlencoded` body
   - Returns lowercase `token_type`

---

## 🧪 Testing

After these changes:

1. **Test Token Exchange:**
   ```bash
   curl -X POST https://your-domain.com/api/chatgpt/oauth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=...&client_id=...&client_secret=..."
   ```

2. **Test GA4 Connection:**
   - Call `/api/chatgpt/oauth/ga4/start` with Bearer token
   - Should return auth_url with connect_code
   - Complete OAuth flow
   - GA4 tokens stored by connectionId

3. **Test API Endpoints:**
   - All endpoints should work with connectionId
   - Premium checks work if user linked
   - Falls back to free plan if no user

---

## 🚀 Deployment

All changes are ready for deployment. The code:
- ✅ Handles both old and new patterns (backwards compatible)
- ✅ Works without user accounts
- ✅ Supports user linking for premium features
- ✅ Follows GPT Actions OAuth best practices

---

**Migration complete!** All endpoints now use `connectionId` instead of `chatgpt_user_id`.
