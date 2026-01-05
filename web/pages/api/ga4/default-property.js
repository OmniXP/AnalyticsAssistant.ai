import { getServerSession } from "next-auth/next";
import prisma from "../../../lib/prisma.js";
import { authOptions } from "../../../lib/authOptions.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { propertyId, propertyName } = req.body || {};
    if (!propertyId || typeof propertyId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing propertyId" });
    }

    const updated = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        ga4PropertyId: propertyId,
        ga4PropertyName: propertyName || null,
      },
      select: { ga4PropertyId: true, ga4PropertyName: true },
    });

    return res.status(200).json({
      ok: true,
      ga4PropertyId: updated.ga4PropertyId,
      ga4PropertyName: updated.ga4PropertyName,
    });
  } catch (e) {
    console.error("[ga4/default-property] Error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}
