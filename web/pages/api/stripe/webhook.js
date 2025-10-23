// pages/api/stripe/webhook.js
// Stripe webhook endpoint using raw body + HMAC verification (no Stripe SDK).
// Handles subscription lifecycle events and logs them.
// You can extend the "entitlements update" area to write to your DB if you add one later.

export const config = {
  api: {
    bodyParser: false, // we need the raw body to verify the Stripe signature
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WH_SECRET) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
  }

  try {
    const buf = await readBuffer(req);
    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).send("Missing Stripe-Signature header");

    // Verify signature
    if (!verifyStripeSignature(buf, sig, WH_SECRET)) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(buf.toString("utf8"));
    const type = event?.type || "unknown";

    // Handle relevant events
    switch (type) {
      case "checkout.session.completed": {
        // subscription created / paid
        // const email = event.data.object.customer_details?.email;
        // const customerId = event.data.object.customer;
        // -> Update entitlements in your DB if you add one later.
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        // const sub = event.data.object;
        // const customerId = sub.customer;
        // const status = sub.status;
        // -> Update entitlements in your DB if you add one later.
        break;
      }
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("stripe webhook error", err);
    return res.status(400).send(`Webhook Error`);
  }
}

/* ----------------------------- Helpers ---------------------------------- */

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

import crypto from "crypto";

/**
 * Stripe signs the payload as: HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
 * Header looks like: t=1699999999,v1=abcdef...,v0=...
 */
function verifyStripeSignature(rawBody, signatureHeader, secret) {
  try {
    const entries = signatureHeader
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((kv) => kv.length === 2)
      .reduce((acc, [k, v]) => ((acc[k] = v), acc), {});

    const t = entries.t;
    const v1 = entries.v1;
    if (!t || !v1) return false;

    const signedPayload = `${t}.${rawBody.toString("utf8")}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(signedPayload, "utf8")
      .digest("hex");

    return timingSafeEqual(expected, v1);
  } catch (e) {
    console.error("verifyStripeSignature error", e);
    return false;
  }
}

function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", (e) => reject(e));
  });
}
