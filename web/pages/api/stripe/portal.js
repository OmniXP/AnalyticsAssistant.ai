// web/pages/api/stripe/portal.js
import Stripe from "stripe";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) return res.status(401).json({ error: "Unauthorised" });

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user?.stripeCustomerId) return res.status(400).json({ error: "No Stripe customer on file" });

  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: process.env.NEXTAUTH_URL + "/insights",
  });

  res.json({ url: portal.url });
}
