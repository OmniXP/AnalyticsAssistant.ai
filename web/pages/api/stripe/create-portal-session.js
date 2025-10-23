// pages/api/stripe/create-portal-session.js
// Creates a Stripe Customer Portal session. We try to find the customer by email.
// Accepts: POST { email: string }
// Returns: { url } or { error }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || getOrigin(req);

  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Missing email" });
    }

    // 1) Look up (first) customer by email
    const searchParams = new URLSearchParams({ email, limit: "1" });
    const custResp = await fetch(`https://api.stripe.com/v1/customers?${searchParams.toString()}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const custData = await custResp.json();
    const customer = Array.isArray(custData.data) && custData.data[0];

    if (!customer?.id) {
      return res.status(404).json({ error: "No Stripe customer found for this email." });
    }

    // 2) Create billing portal session
    const form = new URLSearchParams();
    form.set("customer", customer.id);
    form.set("return_url", `${APP_BASE}/?billing=portal_return`);

    const portalResp = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const portalData = await portalResp.json();
    if (!portalResp.ok) {
      return res.status(portalResp.status).json({ error: portalData.error?.message || "Stripe error" });
    }

    return res.status(200).json({ url: portalData.url });
  } catch (err) {
    console.error("create-portal-session error", err);
    return res.status(500).json({ error: "Server error creating portal session" });
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

