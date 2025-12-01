# AnalyticsAssistant Product Tracking Guide

This app already emits a handful of GA4 events from the client via `gtag.js`. To turn that stream into actionable product metrics:

## 1. Confirm GA4 is receiving events

1. Open **https://analytics.google.com** and pick your `app.analyticsassistant.ai` GA4 property.
2. Go to **Admin → Data Streams → Web → app.analyticsassistant.ai** and ensure the stream shows live traffic.
3. Open the app in another tab, trigger a few actions (visit `/premium`, click “Run GA4 report”, etc.) and watch them land in **Reports → Realtime → Events**. You should see events like:
   - `premium_page_viewed`
   - `signup_started`
   - `report_run`
   - `ga_connect_started` / `ga_connect_completed`
   - `upgrade_cta_clicked`
   - `upgrade_checkout_success`
   - `ai_summary_requested`

If you don’t see them, confirm the GA4 Measurement ID in `web/pages/_document.js` matches the property.

## 2. Mark the key conversions

1. In GA4, navigate to **Admin → Events**.
2. Use “Create event” to promote any custom events if needed, or select the existing ones.
3. Toggle the **Mark as conversion** switch for:
   - `signup_completed`
   - `ga_connect_completed`
   - `report_run`
   - `upgrade_checkout_success`

This fuels the standard “Conversions” report as well as the acquisition overview.

## 3. Build a funnel exploration

1. Go to **Explore → Blank**.
2. Choose the **Funnel exploration** technique.
3. Add steps such as:
   - Step 1: `signup_started`
   - Step 2: `signup_completed`
   - Step 3: `ga_connect_completed`
   - Step 4: `report_run`
   - Step 5: `upgrade_cta_clicked`
   - Step 6: `upgrade_checkout_success`
4. Break down by device category or default channel grouping to see where drop-offs happen.

## 4. Create high-signal audiences

Head to **Configure → Audiences → New audience** and create segments like:

- **“Signed up but never ran a report”** – Include users with `signup_completed` AND exclude those with `report_run`.
- **“Touched Premium but didn’t purchase”** – Include users with `premium_page_viewed` OR `upgrade_cta_clicked` but exclude `upgrade_checkout_success`.
- **“Connected GA4 but no upgrade”** – Include `ga_connect_completed` but exclude `upgrade_checkout_success`.

You can use these audiences for remarketing or to watch their behaviour over time.

## 5. Governance & PII

- We never send email addresses or names to GA4. If you later decide to attach a `user_id`, use an internal opaque identifier or hashed value.
- Continue to use `/admin/users` or direct DB queries for actual user lists, as those operate entirely inside your own infrastructure.

With the helper in `web/lib/analytics.ts` and the events now wired into the main flows, you can treat GA4 as the primary dashboard for adoption, activation, and monetisation metrics. Update this document as you add more events or migrate to another analytics tool.

