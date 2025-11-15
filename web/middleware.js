// /middleware.js
import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_sid";

function uuid() {
  // Tiny UUID; good enough for session id
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

export function middleware(req) {
  const res = NextResponse.next();
  const url = req.nextUrl;

  // We only need SID on app and API paths
  const needsSid =
    url.pathname === "/" ||
    url.pathname.startsWith("/api/");

  if (!needsSid) return res;

  const cookies = req.cookies;
  let sid = cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sid) {
    sid = uuid();
    const isProd = url.hostname && !url.hostname.includes("localhost");
    res.cookies.set(SESSION_COOKIE_NAME, sid, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      // 30 days
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return res;
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
