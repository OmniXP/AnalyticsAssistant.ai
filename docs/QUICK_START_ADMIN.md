# Quick Start: Access Admin Dashboard

## Step 1: Check Your Current Status

1. **Sign in to your app** at `https://app.analyticsassistant.ai`
2. **Navigate to** `https://app.analyticsassistant.ai/admin/users`
3. **Check the page** - it will show you:
   - Your signed-in email address
   - Currently configured admin emails (if any)

## Step 2: Configure ADMIN_EMAILS in Vercel

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project** (analyticsassistant-ai)
3. **Go to Settings** → **Environment Variables**
4. **Add or update** `ADMIN_EMAILS`:
   - **Key**: `ADMIN_EMAILS`
   - **Value**: Your Google account email (the one you sign in with)
   - **Example**: `your.email@gmail.com`
   - **For multiple admins**: Use commas: `admin1@example.com,admin2@example.com`
5. **Important**: Make sure to select the correct **Environment** (Production, Preview, Development) or "All" if you want it everywhere
6. **Click "Save"**

## Step 3: Redeploy

After updating the environment variable, you need to redeploy:

**Option A: Via Vercel Dashboard**
1. Go to **Deployments** tab
2. Click the **three dots** (⋯) on the latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete

**Option B: Via Git**
```bash
# Make a small change and push (or just push an empty commit)
git commit --allow-empty -m "Trigger redeploy for ADMIN_EMAILS"
git push
```

## Step 4: Verify Access

1. **Sign out** and **sign back in** to refresh your session (or wait a few minutes)
2. **Navigate to** `https://app.analyticsassistant.ai/admin/users`
3. You should now see the **Users table** with:
   - Email addresses
   - Premium status
   - Plan types
   - GA4 Property names
   - Account creation dates

## Troubleshooting

**If you still see "Admin access required":**
- Double-check that your email matches exactly (case-insensitive)
- Make sure you redeployed after adding the environment variable
- Try signing out and signing back in
- Check the page - it shows which emails are configured vs. which email you're signed in as

**If you see "This page could not be found" (404):**
- Make sure you're using the correct URL: `/admin/users` (not `/admin`)

**If you see a database error:**
- Check that your `DATABASE_URL` is correctly configured in Vercel
- Verify your database connection is working

## What You'll See

Once you have access, the dashboard shows:
- **Search/Filter**: Filter users by email, plan, or GA4 property
- **User Table**: All users with their:
  - Email address
  - Premium status (Yes/No)
  - Plan (monthly/annual or null)
  - Connected GA4 Property name
  - Account creation date

This gives you a simple CRM-style overview of who's using your app and who has upgraded!

