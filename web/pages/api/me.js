import { getServerSession } from "next-auth/next";
import prisma from "../../lib/prisma.js";
import { authOptions } from "../../lib/authOptions.js";

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(200).json({ signedIn: false, premium: false, plan: null });
    }
    const email = session.user.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { premium: true, plan: true, name: true },
    });
    return res.status(200).json({
      signedIn: true,
      email,
      name: user?.name || session.user.name || "",
      premium: !!user?.premium,
      plan: user?.plan || null,
    });
  } catch (err) {
    console.error("/api/me error", err);
    return res.status(500).json({ signedIn: false, premium: false, plan: null, error: "Failed to load profile" });
  }
}
