// pages/api/stripe/create-checkout-session.js
// Creates a Stripe Checkout Session for subscriptions using Stripe's REST API (no SDK).
// Accepts: POST { priceId?: string, plan?: "monthly"|"annual", email?: string }
// - If priceId is omitted, plan decides between STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL.
// - If email is omitted, Stripe will collect it in Checkout.
// Returns: { url } or { error }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || getOrigin(req);

  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  }

  try {
    const { priceId, plan = "monthly", email } = (req.body || {});
    const defaultPrice =
      priceId ||
      (plan === "annual"
        ? process.env.STRIPE_PRICE_ANNUAL
        : process.env.STRIPE_PRICE_MONTHLY);

    if (!defaultPrice) {
      return res.status(400).json({ error: "Missing priceId and no default plan price configured" });
    }

    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("success_url", `${APP_BASE}/?billing=success`);
    form.set("cancel_url", `${APP_BASE}/?billing=cancelled`);
    form.set("line_items[0][price]", defaultPrice);
    form.set("line_items[0][quantity]", "1");
    form.set("allow_promotion_codes", "true");
    // If you already know the customer's email (e.g., from Google OAuth), pass it:
    if (email && typeof email === "string") form.set("customer_email", email);

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || "Stripe error" });
    }

    return res.status(200).json({ url: data.url });
  } catch (err) {
    console.error("create-checkout-session error", err);
    return res.status(500).json({ error: "Server error creating checkout session" });
  }
}

function getOrigin(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host || "";
    const proto = (req.headers["x-forwarded-proto"] || "https").toString();
    if (!host) return "";
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}
