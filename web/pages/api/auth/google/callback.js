// /workspaces/insightsgpt/web/pages/api/auth/google/callback.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  }
};

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${baseUrl}/api/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    return res.status(400).send(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }

  const session = await getIronSession(req, res, sessionOptions);
  session.gaTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expiry_date: Date.now() + (tokens.expires_in || 3600) * 1000
  };
  await session.save();

  res.redirect("/connected");
}
