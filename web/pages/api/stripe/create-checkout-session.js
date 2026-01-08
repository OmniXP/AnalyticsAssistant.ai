import Stripe from "stripe";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";
import prisma from "../../../lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function resolveBaseUrl(req) {
  // Prefer the same public app URL used elsewhere (e.g. https://app.analyticsassistant.ai)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "http").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000").toString();
  return `${proto}://${host}`.replace(/\/$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    // Require a logged-in user so we can link the Stripe session to their account
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Not signed in" });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    // plan can be "monthly" or "annual" (default to monthly)
    const { plan = "monthly" } = req.body || {};

    const price =
      plan === "annual"
        ? process.env.STRIPE_PRICE_ID_ANNUAL
        : process.env.STRIPE_PRICE_ID_MONTHLY;

    if (!price) return res.status(400).json({ error: "Invalid or missing price for plan" });

    const baseUrl = resolveBaseUrl(req);
    const checkoutSession = await stripe.checkout.sessions.create({
      // IMPORTANT: monthly/annual implies recurring → use "subscription"
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        app_user_id: user.id,
        app_email: user.email,
      },
      success_url: `${baseUrl}/insights?checkout=success&plan=${plan}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/start?checkout=canceled`,
      // Nice-to-haves:
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({ error: "Unable to create checkout session" });
  }
}
