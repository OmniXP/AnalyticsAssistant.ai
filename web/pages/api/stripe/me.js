// pages/api/stripe/me.js
// Returns premium entitlement for a user by email by checking active Stripe subscriptions.
// GET /api/stripe/me?email=someone@example.com
// Response: { premium: boolean, status?: "active"|"trialing"|"past_due"|... , customerId?: string }

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

  try {
    const email = (req.query.email || "").toString().trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Missing email" });

    // Optional: read short-lived cache from memory (per lambda) to reduce hits
    // For simplicity, we skip caching here to keep logic explicit and dependency-free.

    // 1) Find (first) customer by email
    const q = new URLSearchParams({ email, limit: "1" });
    const custResp = await fetch(`https://api.stripe.com/v1/customers?${q.toString()}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const custData = await custResp.json();
    const customer = Array.isArray(custData.data) && custData.data[0];

    if (!customer?.id) {
      // No Stripe record -> not premium
      return res.status(200).json({ premium: false });
    }

    // 2) List active subscriptions for that customer
    const subQ = new URLSearchParams({
      customer: customer.id,
      status: "all",
      expand: ["data.default_payment_method"].map((e, i) => `expand[${i}]`).join("&"), // optional
      limit: "3",
    });
    const subsResp = await fetch(`https://api.stripe.com/v1/subscriptions?${subQ.toString()}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const subsData = await subsResp.json();
    const subs = Array.isArray(subsData.data) ? subsData.data : [];

    const activeSub = subs.find((s) =>
      ["active", "trialing", "past_due", "unpaid"].includes(s.status)
    );

    if (!activeSub) {
      return res.status(200).json({ premium: false, customerId: customer.id });
    }

    return res.status(200).json({
      premium: true,
      status: activeSub.status,
      customerId: customer.id,
    });
  } catch (err) {
    console.error("stripe/me error", err);
    return res.status(500).json({ error: "Server error in /api/stripe/me" });
  }
}
