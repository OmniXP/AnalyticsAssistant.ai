// /pages/api/stripe/confirm.js
import Stripe from "stripe";
import crypto from "crypto";

const COOKIE_NAME = "igpt_premium";
const COOKIE_SIG = "igpt_premium_sig";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const SIGNING_SECRET = process.env.COOKIE_SIGNING_SECRET || "change_me_long_random_secret";

function sign(value) {
  return crypto.createHmac("sha256", SIGNING_SECRET).update(value).digest("hex");
}

function setPremiumCookie(res, enabled) {
  const val = enabled ? "1" : "0";
  const sig = sign(val);
  const base = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE};`;
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.setHeader("Set-Cookie", [
    `${COOKIE_NAME}=${val}${base}${secure}`,
    `${COOKIE_SIG}=${sig}${base}${secure}`,
  ]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

  const { session_id: sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "Missing session_id" });

  try {
    const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer"],
    });

    const paid = session.payment_status === "paid" || session.status === "complete";
    const premium = paid && session.customer && session.customer.metadata
      ? String(session.customer.metadata.insightgpt_premium || "") === "true"
      : false;

    // Set cookie so UI can gate features instantly
    setPremiumCookie(res, premium);

    return res.status(200).json({
      ok: true,
      premium,
      session_status: session.status,
      payment_status: session.payment_status,
    });
  } catch (err) {
    console.error("confirm error", err);
    return res.status(500).json({ error: "Server error in confirm" });
  }
}
