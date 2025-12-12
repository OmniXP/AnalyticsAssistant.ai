# ChatGPT App Setup

Environment variables (add to `.env` and Vercel):

- `CHATGPT_CLIENT_ID` — ChatGPT app client ID from OpenAI
- `CHATGPT_CLIENT_SECRET` — ChatGPT app client secret
- `CHATGPT_REDIRECT_URI` — OAuth redirect URI (e.g. `https://yourdomain.com/api/chatgpt/oauth/callback`)
- `PREMIUM_URL` or `NEXT_PUBLIC_PREMIUM_URL` — Premium landing page (default `https://analyticsassistant.ai/premium`)

Other required env already used by the app:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `OPENAI_API_KEY` (and optional `OPENAI_MODEL`)
- `UPSTASH_KV_REST_URL`, `UPSTASH_KV_REST_TOKEN` (KV storage)

Notes:

- ChatGPT endpoints are under `/api/chatgpt/*` and use Bearer tokens (no cookies).
- GA4 OAuth callback: `/api/chatgpt/oauth/ga4/callback`.
- Token storage keys are isolated (`chatgpt_token:*`, `chatgpt_ga4_tokens:*`).
