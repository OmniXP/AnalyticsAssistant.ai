// app/api/auth/[...nextauth]/route.ts
import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";

// Prisma client (simple singleton for dev)
const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// --- Minimal AES-GCM encryption for refresh_token (MVP) ---
import crypto from "crypto";
const ENC_KEY_B64 = process.env.ENCRYPTION_KEY || "";
if (!ENC_KEY_B64) {
  console.warn("ENCRYPTION_KEY missing (used for token encryption). Set it in .env.local");
}
const ENC_KEY = Buffer.from(ENC_KEY_B64, "base64");
function enc(value?: string | null) {
  if (!value || !ENC_KEY.length) return value || null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

// use Prisma adapter, but intercept linkAccount to encrypt refresh_token
const adapter = PrismaAdapter(prisma);
const originalLinkAccount = adapter.linkAccount!;
adapter.linkAccount = async (account) => {
  if (account.refresh_token) account.refresh_token = enc(account.refresh_token);
  return originalLinkAccount(account);
};

export const authOptions: NextAuthOptions = {
  adapter,
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          scope:
            "openid email profile https://www.googleapis.com/auth/analytics.readonly",
        },
      },
      profile: (p) => ({
        id: p.sub,
        name: p.name,
        email: p.email,
        image: p.picture,
      }),
    }),
  ],
  pages: {
    // If someone visits /api/auth/signin, send them to your pre-consent UI
    signIn: "/start",
  },
  events: {
    async createUser({ user }) {
      // Optional: send user to your ESP/CRM via webhook
      // await fetch(process.env.MY_WEBHOOK_URL!, { method: "POST", body: JSON.stringify(user) });
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
