# Security, privacy & observability checklist

_Last updated: 2025-11-17_

## OAuth & data access

- GA4 scope is **`https://www.googleapis.com/auth/analytics.readonly`** only.
- OAuth consent screen links to the production app home, [Privacy Policy](https://app.analyticsassistant.ai/privacy), and [Terms](https://app.analyticsassistant.ai/terms).
- Tokens are exchanged server-side via `lib/server/google-oauth.ts` and persisted in Vercel KV (Upstash) with AES‑encrypted refresh tokens in Prisma (NextAuth adapter patch).
- Disconnecting GA4 removes the stored tokens and clears the session cookie; users can also revoke access from their Google Account.

## Cookies & sessions

- Application cookie (`aa_sid`) is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- NextAuth session cookies are managed by the default `database` strategy; `/api/me` exposes the signed-in user + plan so the client never trusts localStorage alone.
- Legacy iron-session endpoints have been deprecated in favour of `getBearerForRequest`; all new endpoints rely on the shared session helper.

## Rate limiting & quotas

- `lib/server/usage-limits.js` centralises usage tracking (via KV) and premium gating (NextAuth + Prisma).
- Free plan: **25 GA4 reports/month, 10 AI summaries/month, 1 GA4 property, last 90 days of data**.
- Premium plan: **Effectively unlimited GA4 reports (fair use), 100 AI summaries/month, up to 5 properties, full GA4 history**.
- Guards are wired into every GA4 and AI API route; responses include `code`, `limit`, and user-friendly messaging surfaced in the dashboard.
- Guard failures (`RATE_LIMITED`, `PREMIUM_REQUIRED`, `AUTH_REQUIRED`) are logged with a hashed identity key for SRE visibility.

## Logging & monitoring

- GA4 + AI API routes log unexpected failures and authentication problems.
- Rate-limit/premium denials log at `warn` level with the usage kind and plan.
- Vercel’s built-in request logging remains enabled; for production deploys wire a log drain (Logtail / Datadog) if deeper analytics are required.
- TODO (post-launch): wire GA4 Admin/API latency metrics and add per-route timers if needed.

## Operational runbook

- Stripe webhooks (`/api/stripe/webhook`) update `User.premium`, `plan`, `stripeCustomerId`, `stripeSubId`; see `/pages/admin/users` for a lightweight subscriber view and manual search.
- Use `/api/auth/google/status` to verify GA4 tokens, `/api/ga4/debug-session` for bearer inspection, and `/api/dev/*` helpers during SRE rotations.
- The QA “premium override” flag (`insightgpt_premium_flag_v1` in `localStorage`) is still supported but surfaces a UI warning when active.


