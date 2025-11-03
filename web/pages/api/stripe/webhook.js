// /pages/api/stripe/webhook.js
import Stripe from "stripe";

export const config = {
  api: { bodyParser: false }, // raw body for signature verification
};

// raw body helper (no extra deps)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
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

  let event;
  try {
    const buf = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(buf, signature, whSecret);
  } catch (err) {
    console.error("⚠️  Webhook signature verification failed.", err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    switch (event.type) {
      // ===== Checkout completed (subscription sign-up) =====
      case "checkout.session.completed": {
        const session = event.data.object; // mode === 'subscription'
        const customerId = session.customer || null;
        const customerEmail = session.customer_details?.email || null;

        // Determine plan by the purchased price ID
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const priceId = lineItems.data[0]?.price?.id || null;

        const plan =
          priceId === process.env.STRIPE_PRICE_ID_ANNUAL
            ? "annual"
            : "monthly"; // default to monthly if unsure

        const subscriptionId = session.subscription || null;

        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: {
              ...(session.metadata || {}),
              insightgpt_premium: "true",
              insightgpt_plan: plan,
              insightgpt_subscription_id: subscriptionId || "",
            },
          });
        }

        // Optional: persist to your DB using customerEmail (NextAuth user)
        // const prisma = new PrismaClient();
        // if (customerEmail) {
        //   await prisma.user.update({
        //     where: { email: customerEmail },
        //     data: { premium: true, plan, stripeCustomerId: customerId || "", stripeSubId: subscriptionId || "" },
        //   });
        // }
        break;
      }

      // ===== Session expired before paying =====
      case "checkout.session.expired": {
        const session = event.data.object;
        const customerId = session.customer;
        if (customerId) {
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

      // ===== Subscription lifecycle (keeps premium flag in sync) =====
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = sub.customer;
        const activeish = ["trialing", "active", "past_due"].includes(sub.status);

        // Try to infer plan from items (fallback to existing metadata)
        let plan = "monthly";
        const priceId = sub.items?.data?.[0]?.price?.id || null;
        if (priceId === process.env.STRIPE_PRICE_ID_ANNUAL) plan = "annual";

        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: {
              insightgpt_premium: activeish ? "true" : "false",
              insightgpt_plan: plan,
              insightgpt_subscription_id: sub.id,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub.customer;
        if (customerId) {
          await stripe.customers.update(customerId, {
            metadata: {
              insightgpt_premium: "false",
              insightgpt_plan: "", // cleared
              insightgpt_subscription_id: "",
            },
          });
        }
        break;
      }

      // ===== Optional: one-off refund handling =====
      case "charge.refunded": {
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
        // console.log(`Unhandled event type ${event.type}`);
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "Webhook processing error" });
  }
}
