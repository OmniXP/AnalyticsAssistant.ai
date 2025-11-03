// web/pages/api/ga4/select.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) return res.status(401).json({ error: "Unauthorised" });

  const { propertyId, propertyName } = req.body || {};
  if (!propertyId) return res.status(400).json({ error: "Missing propertyId" });

  await prisma.user.update({
    where: { email: session.user.email },
    data: { ga4PropertyId: propertyId, ga4PropertyName: propertyName || null },
  });

  return res.json({ ok: true });
}
