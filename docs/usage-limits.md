# Usage limits

AnalyticsAssistant enforces lightweight **monthly** quotas to keep GA4 and AI usage predictable.

| Plan   | GA4 reports / month | “Summarise with AI” / month | Data / properties |
|--------|---------------------|-----------------------------|-------------------|
| Free   | 25                  | 10                          | 1 GA4 property, last 90 days |
| Premium| ~unlimited (fair use) | 100                      | Up to 5 GA4 properties, full history |

Notes:

* Limits are tracked per signed-in user. If a user is not signed in, the request is associated with the GA4 session cookie or IP.
* Premium sections (Trends over time, Campaigns, Landing Pages, etc.) also check the user’s subscription server-side.
* Once a limit is reached, the API responds with HTTP 429 and the UI surfaces a friendly “monthly limit reached — upgrade / wait” message.
* Values can be tuned in `web/lib/server/usage-limits.js` and mirrored in `web/pages/index.js` for client-side messaging.

