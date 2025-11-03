import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    // plan can be "monthly" or "annual" (default to monthly)
    const { plan = 'monthly' } = req.body || {};

    const price =
      plan === 'annual'
        ? process.env.STRIPE_PRICE_ID_ANNUAL
        : process.env.STRIPE_PRICE_ID_MONTHLY;

    if (!price) return res.status(400).json({ error: 'Invalid or missing price for plan' });

    const session = await stripe.checkout.sessions.create({
      // IMPORTANT: monthly/annual implies recurring → use "subscription"
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: 'https://app.analyticsassistant.ai/insights?checkout=success&plan=' + plan + '&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://app.analyticsassistant.ai/start?checkout=canceled',
      // Nice-to-haves:
      allow_promotion_codes: true,
      customer_creation: 'always',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
}
