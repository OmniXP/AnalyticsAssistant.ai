# Cost Tracking Setup Guide

The cost monitoring dashboard now integrates with provider APIs to fetch real-time usage and cost data. Follow these steps to enable accurate cost tracking.

## Required Environment Variables

Add these to your Vercel project settings (or `.env.local` for local development):

### Vercel API (OPTIONAL - for hosting costs)
```bash
VERCEL_API_TOKEN=your_vercel_api_token  # Optional - see note below
VERCEL_TEAM_ID=your_team_id  # Optional, only if using team account
VERCEL_PROJECT_ID=your_project_id  # Optional, for specific project
```

**⚠️ Important Note:**
Vercel no longer provides easy access to API tokens in the standard dashboard. The `VERCEL_API_TOKEN` is **optional** and only needed if you want automated cost tracking.

**Options:**
1. **Skip Vercel API tracking** (Recommended for most users)
   - The dashboard will estimate Vercel costs (~$20/month base)
   - Check actual costs directly in Vercel Dashboard → Settings → Billing
   - This is the simplest approach

2. **Enable Vercel API tracking** (Advanced)
   - Requires creating a Vercel Integration (not a simple API token)
   - Go to Vercel Dashboard → Settings → Integrations
   - Create/configure an Integration to get machine-to-machine tokens
   - This is mainly for building official integrations or advanced automation
   - For most SaaS apps, this is overkill

**Recommendation:** Skip `VERCEL_API_TOKEN` and check Vercel costs manually in the Vercel dashboard. The cost monitoring dashboard will still track all other costs accurately (database, KV, AI, Stripe).

### Upstash KV (for storage costs)
Already configured via:
```bash
UPSTASH_KV_REST_URL=your_upstash_url
UPSTASH_KV_REST_TOKEN=your_upstash_token
```

The cost tracking will automatically extract the database ID from your URL.

### Neon Database (for database costs)
```bash
NEON_API_KEY=your_neon_api_key
NEON_PROJECT_ID=your_neon_project_id
```

**How to get:**
1. Go to https://console.neon.tech
2. Navigate to your project → Settings → API
3. Create an API key
4. Copy your project ID from the project URL or settings

### Stripe (for revenue and fees)
Already configured via:
```bash
STRIPE_SECRET_KEY=your_stripe_secret_key
```

The cost tracking automatically fetches transaction data from Stripe.

### OpenAI (for AI costs)
Already configured via:
```bash
OPENAI_API_KEY=your_openai_api_key
```

AI usage is automatically tracked when summaries are generated. No additional setup needed.

## How It Works

1. **Real-time Data Fetching**: The `/api/admin/costs` endpoint fetches data from:
   - Vercel API (function invocations, bandwidth)
   - Upstash API (KV read/write operations)
   - Neon API (database storage and compute)
   - Stripe API (revenue and transaction fees)
   - Internal tracking (AI API usage)

2. **Cost Calculation**: Costs are calculated based on:
   - Provider pricing tiers
   - Actual usage data
   - Free tier allowances

3. **Caching**: Data is cached for 1 hour to reduce API calls. Use `?refresh=true` to force a refresh.

4. **AI Usage Tracking**: Every AI summary request automatically tracks:
   - Model used
   - Tokens consumed
   - Cost calculated based on OpenAI pricing

## Accessing the Dashboard

1. Sign in as an admin user
2. Navigate to `/admin/costs`
3. The dashboard shows:
   - Real-time costs (if APIs are configured)
   - Estimated costs (if APIs are not configured)
   - Usage statistics
   - Cost breakdown by service
   - Revenue vs costs
   - Profit margin

## Troubleshooting

### "Failed to fetch cost data" Error

**Check:**
1. Environment variables are set correctly in Vercel
2. API tokens have the correct permissions
3. API tokens are not expired
4. Network/firewall allows outbound API calls

**Fallback:**
If APIs fail, the dashboard falls back to estimated costs based on user counts and typical usage patterns.

### Costs Showing as $0

**Possible causes:**
1. Free tier usage (no costs yet)
2. API credentials not configured
3. API errors (check browser console for details)
4. Usage below billing thresholds

### AI Costs Not Tracking

**Check:**
1. `OPENAI_API_KEY` is set
2. AI summary endpoints are being called
3. OpenAI API responses include usage data (they should automatically)

## Manual Cost Updates

If you prefer to update costs manually or use webhooks:

1. **Webhook Endpoint**: Create `/api/admin/costs/webhook` to receive cost updates
2. **Manual Updates**: Use the cost tracking service directly:
   ```javascript
   import { cacheCosts, getAggregatedUsage, calculateCosts } from '@/lib/server/cost-tracking';
   
   const usage = await getAggregatedUsage();
   const costs = calculateCosts(usage);
   await cacheCosts(usage, costs);
   ```

## Cost Alerts

Set cost thresholds in the dashboard. When costs exceed the threshold, an alert banner appears. Thresholds are saved in localStorage.

## Next Steps

1. Configure all API credentials
2. Test the dashboard to ensure data is loading
3. Set appropriate cost thresholds
4. Monitor costs regularly
5. Adjust pricing or usage limits as needed

