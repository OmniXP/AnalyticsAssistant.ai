// /pages/api/stripe/create-checkout-session.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

  const {
    priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
    // Optional: pass an email if you capture it in your UI
    customer_email = undefined,
    // Optional: metadata additions
    metadata = {},
    // Optional: success/cancel override
    successUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?upgrade=canceled`,
    mode = "payment", // or "subscription"
  } = req.body || {};

  if (!priceId) return res.status(400).json({ error: "Missing priceId (or NEXT_PUBLIC_STRIPE_PRICE_ID)" });

  try {
    const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

    const params = {
      mode,
      line_items: [{ price: String(priceId), quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      metadata: { ...metadata },
    };
    if (customer_email) params.customer_email = customer_email;

    const session = await stripe.checkout.sessions.create(params);
    return res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error("create-checkout-session error", err);
    return res.status(400).json({ error: err?.message || "Stripe error" });
  }
}
