// web/pages/api/dev/env-dump.js
// Minimal “does the process see the names” check (never returns the token value).

export default function handler(_req, res) {
  const hasUrl = !!process.env.UPSTASH_KV_REST_URL;
  const hasToken = !!process.env.UPSTASH_KV_REST_TOKEN;
  const hasStripeSecret = !!process.env.STRIPE_SECRET_KEY;
  const hasStripeMonthly = !!process.env.STRIPE_PRICE_ID_MONTHLY;
  const hasStripeAnnual = !!process.env.STRIPE_PRICE_ID_ANNUAL;
  res.status(200).json({
    ok: true,
    UPSTASH_KV_REST_URL: hasUrl ? "present" : "missing",
    UPSTASH_KV_REST_TOKEN: hasToken ? "present" : "missing",
    STRIPE_SECRET_KEY: hasStripeSecret ? "present" : "missing",
    STRIPE_PRICE_ID_MONTHLY: hasStripeMonthly ? "present" : "missing",
    STRIPE_PRICE_ID_ANNUAL: hasStripeAnnual ? "present" : "missing",
    note: "Values are intentionally not returned. This only indicates presence.",
  });
}
