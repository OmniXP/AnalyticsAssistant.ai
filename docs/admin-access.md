# Admin Access Configuration

The `/admin/users` page provides a simple CRM-style overview of all users, their premium status, plans, and GA4 connections.

## Setup Instructions

1. **Configure Admin Emails in Vercel:**
   - Go to your Vercel project → **Settings** → **Environment Variables**
   - Add or update `ADMIN_EMAILS` with a comma-separated list of Google account emails that should have admin access
   - Example: `admin@example.com,another@example.com`
   - **Important:** Use the exact email address you sign in with (case-insensitive matching)

2. **Redeploy:**
   - After updating `ADMIN_EMAILS`, trigger a new deployment so the server picks up the updated environment variable
   - You can do this via Vercel dashboard → **Deployments** → **Redeploy** (or push a new commit)

3. **Verify Access:**
   - Sign in to the app at `https://app.analyticsassistant.ai` with your admin Google account
   - Navigate to `https://app.analyticsassistant.ai/admin/users`
   - You should see a table listing all users with their:
     - Email
     - Premium status (Yes/No)
     - Plan (monthly/annual or null)
     - GA4 Property Name (if connected)
     - Account creation date

## Troubleshooting

**If you're redirected to `/start`:**
- Check that `ADMIN_EMAILS` is set correctly in Vercel
- Verify you're signed in with the exact email listed in `ADMIN_EMAILS`
- Ensure you've redeployed after updating the environment variable
- Check the page - it will show you which emails are currently configured and which email you're signed in as

**If you see "Admin access required" page:**
- The page will display:
  - Your current signed-in email
  - The list of configured admin emails
- Compare these to ensure your email matches exactly (case-insensitive)

## Security Notes

- Admin access is server-side only - the check happens in `getServerSideProps`
- Only users whose emails are in `ADMIN_EMAILS` can access the page
- The page shows user data from your database (email, premium status, plan, etc.) but never exposes sensitive data like tokens or passwords
- Use this page for support, user research, and understanding adoption patterns alongside your GA4 funnels

