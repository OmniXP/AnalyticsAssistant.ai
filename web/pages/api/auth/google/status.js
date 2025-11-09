// web/pages/api/auth/google/status.js
// Front-end uses this to show “Connected / Not connected”
import { getIronSession } from "iron-session/edge";

export const config = { runtime: "edge" };

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

export default async function handler(req) {
  try {
    const resHeaders = new Headers({ "Cache-Control": "no-store" });
    const session = await getIronSession(req, { headers: resHeaders }, sessionOptions);
    const connected = !!session?.gaTokens?.access_token;
    return new Response(JSON.stringify({ connected }), {
      status: 200,
      headers: { ...Object.fromEntries(resHeaders), "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ connected: false, error: String(e?.message || e) }), {
      status: 200,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
    });
  }
}
