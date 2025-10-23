// /pages/api/me.js
import crypto from "crypto";

const COOKIE_NAME = "igpt_premium";
const COOKIE_SIG = "igpt_premium_sig";
const SIGNING_SECRET = process.env.COOKIE_SIGNING_SECRET || "change_me_long_random_secret";

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(";").map((v) => v.trim());
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
  }
  return out;
}

function verify(val, sig) {
  if (typeof val !== "string" || typeof sig !== "string") return false;
  const expected = crypto.createHmac("sha256", SIGNING_SECRET).update(val).digest("hex");
  // constant-time compare
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const val = cookies[COOKIE_NAME];
  const sig = cookies[COOKIE_SIG];

  let premium = false;
  if (val && sig && verify(val, sig)) {
    premium = val === "1";
  }

  return res.status(200).json({ premium });
}
