# Pre-launch QA & go-live checklist

_Updated: 2025-11-17_

## 1. Functional smoke tests
- [ ] Sign in via NextAuth → `/connections`
- [ ] Connect GA4 (OAuth flow + callback) and confirm `/api/auth/google/status` returns `hasTokens: true`
- [ ] Select GA4 property and run the hero report (channels)
- [ ] Exercise each section (Source/Medium, Top pages, Premium sections) and confirm data renders
- [ ] Run “Summarise with AI” on at least two sections

## 2. Rate limits & entitlements
- [ ] Hit the Free GA4 limit (25 requests this month) using `/api/ga4/query` and observe the 429 “monthly limit” messaging
- [ ] Hit the Free AI limit (10 summaries this month) and verify the UX copy nudges an upgrade
- [ ] On Free, attempt to select a second GA4 property and confirm the plan limit error
- [ ] On Free, request a date range older than 90 days and confirm the request is blocked
- [ ] Toggle Premium (via Stripe Checkout or QA override) and confirm premium sections unlock + higher limits apply

## 3. Browser/device matrix
- [ ] Chrome (latest) on macOS
- [ ] Safari (latest) on macOS/iOS
- [ ] Firefox (latest) on macOS/Windows
- [ ] At least one mobile browser (Safari iOS or Chrome Android) for responsive layout

## 4. OAuth & security sanity
- [ ] OAuth consent screen displays correct scopes, privacy, and terms URLs
- [ ] GA session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] Disconnect GA4 (`/api/auth/google/disconnect`) removes tokens and clears cookie
- [ ] `/api/me` returns accurate premium/plan info; dashboard badge updates

## 5. Stripe billing flows
- [ ] Run a full Checkout (test mode) for Monthly + Annual plans
- [ ] Verify Stripe webhook updates `User.premium`, `plan`, `stripeSubId`
- [ ] Access the customer portal via the app and cancel a subscription → premium revokes
- [ ] Confirm admin view (`/admin/users`) reflects plan/state and filtering works

## 6. Content & footer links
- [ ] Footer renders Privacy + Terms links on every page
- [ ] Property picker card explains free vs premium limits with upgrade CTA
- [ ] Campaign drill-down instructions mention copying names from the Campaigns panel

## 7. Monitoring & alerts
- [ ] Check Vercel logs for OAuth / GA4 / AI errors
- [ ] Confirm rate-limit events log with identity key
- [ ] (Optional) Configure Logtail/Datadog drain before GA launch

## 8. Soft launch plan
- [ ] Invite 3–5 trusted beta users
- [ ] Collect feedback on performance, AI guidance, pricing perception
- [ ] Iterate limits or copy before public announcement

