// /workspaces/insightsgpt/web/pages/api/auth/google/start.js
export default async function handler(req, res) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL; // e.g. https://your-app.vercel.app
  if (!baseUrl) return res.status(500).send("Missing NEXT_PUBLIC_BASE_URL");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl}/api/auth/google/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/analytics.readonly"
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.redirect(authUrl);
}
