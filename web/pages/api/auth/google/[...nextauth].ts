import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const prisma = new PrismaClient();

// --- Minimal AES-GCM encryption for refresh_token (MVP) ---
const ENC_KEY_B64 = process.env.ENCRYPTION_KEY || "";
if (!ENC_KEY_B64) {
  console.warn("ENCRYPTION_KEY missing (used for token encryption). Set it in web/.env.local");
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

// Patch adapter to encrypt refresh_token on save
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
  pages: { signIn: "/start" },
};

export default function auth(req: NextApiRequest, res: NextApiResponse) {
  return NextAuth(req, res, authOptions);
}
