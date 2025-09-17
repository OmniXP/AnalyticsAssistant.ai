// /workspaces/insightsgpt/web/pages/api/ga4/top-pages.js
// Queries GA4 Top Pages using the Analytics Data API.
// This looks for an OAuth access token in common cookie names.
// If your project uses a specific name, set GA_TOKEN_COOKIE in Vercel env.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { propertyId, startDate, endDate, limit = 10 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId, startDate or endDate" });
  }

  // 1) Try a list of likely cookie names (plus GA_TOKEN_COOKIE env)
  const CANDIDATE_COOKIES = [
    process.env.GA_TOKEN_COOKIE,                // set this in Vercel if needed
    "ga_access_token",                          // common in our examples
    "google_access_token",
    "access_token",
    "session_token",
    "next-auth.session-token"                   // if using NextAuth
  ].filter(Boolean);

  let token = null;
  for (const name of CANDIDATE_COOKIES) {
    if (req.cookies?.[name]) { token = req.cookies[name]; break; }
  }

  // 
