// web/pages/api/auth/google/callback.js
import { getIronSession } from "iron-session";
import { readAuthState, exchangeCodeForTokens } from "../_core/google-oauth";

export const config = { runtime: "nodejs" };

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

function isAllowedRedirect(path) {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;      // forbid absolute external URLs
  if (path.startsWith("/dev/")) return false;   // block legacy dev pages
  return true;
}

export default async function handler(req, res) {
  try {
    const { code, state } = req.query || {};
    if (!code) return res.status(400).send("Missing code");

    const saved = await readAuthState(String(state || ""));
    const redirectEnv = process.env.POST_AUTH_REDIRECT || "/";
    const desired = isAllowedRedirect(saved?.redirect) ? saved.redirect : redirectEnv;

    const tokens = await exchangeCodeForTokens(code);

    const sess = await getIronSession(req, res, sessionOptions);
    sess.gaTokens = tokens;
    await sess.save();

    res.writeHead(302, { Location: desired });
    res.end();
  } catch (e) {
    res.status(500).json({ error: "OAuth callback failed", message: String(e?.message || e) });
  }
}
