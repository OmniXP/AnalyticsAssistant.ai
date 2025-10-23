// /pages/api/stripe/webhook.js
import Stripe from "stripe";

export const config = {
  api: {
    // We need the raw body to verify Stripe's signature
    bodyParser: false,
  },
};

// Read raw body helper (no extra deps)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function isTruthy(x) {
  return x === true || x === "true" || x === "1" || x === 1;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
  if (!whSecret) return res.status(500).json({ error: "Missing STRIPE_WEBHOOK_SECRET" });

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

  let buf;
  let event;
  try {
    buf = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(buf, signature, whSecret);
  } catch (err) {
    console.error("⚠️  Webhook signature verification failed.", err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Payment successful: mark customer premium=true
        const session = event.data.object;
        const customerId = session.customer;
        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: { ...(session.metadata || {}), insightgpt_premium: "true" },
          });
        }
        break;
      }

      case "checkout.session.expired": {
        // If it expired before paying, we can choose to mark as false (no-op if no customer)
        const session = event.data.object;
        const customerId = session.customer;
        if (customerId) {
          // Don't downgrade if already true due to another purchase
          const customer = await stripe.customers.retrieve(customerId);
          const already = isTruthy(customer?.metadata?.insightgpt_premium);
          if (!already) {
            await stripe.customers.update(customerId, {
              metadata: { ...(customer.metadata || {}), insightgpt_premium: "false" },
            });
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // Subscription status controls premium flag
        const sub = event.data.object;
        const customerId = sub.customer;
        const activeish = ["trialing", "active", "past_due"].includes(sub.status);
        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: { insightgpt_premium: activeish ? "true" : "false" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub.customer;
        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: { insightgpt_premium: "false" },
          });
        }
        break;
      }

      case "charge.refunded": {
        // Optional: if a one-off purchase was refunded, you may want to revoke premium
        const charge = event.data.object;
        const customerId = charge.customer;
        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: { insightgpt_premium: "false" },
          });
        }
        break;
      }

      default:
        // For observability; keep but don’t fail the webhook
        // console.log(`Unhandled event type ${event.type}`);
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "Webhook processing error" });
  }
}
