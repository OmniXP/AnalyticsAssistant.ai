// web/lib/authOptions.js
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import crypto from "crypto";
import prisma from "./prisma";

// --- Minimal AES-GCM encryption for refresh_token (MVP) ---
const ENC_KEY_B64 = process.env.ENCRYPTION_KEY || ""; // base64-encoded 32-byte key
let ENC_KEY = null;
if (ENC_KEY_B64) {
  try {
    ENC_KEY = Buffer.from(ENC_KEY_B64, "base64");
    if (ENC_KEY.length !== 32) {
      console.warn("ENCRYPTION_KEY must decode to 32 bytes. Token encryption will be skipped.");
      ENC_KEY = null;
    }
  } catch {
    console.warn("ENCRYPTION_KEY is not valid base64. Token encryption will be skipped.");
  }
} else {
  console.warn("ENCRYPTION_KEY missing. Token encryption will be skipped.");
}
function enc(value) {
  if (!value || !ENC_KEY) return value || null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const encBuf = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encBuf]).toString("base64");
}

// Patch PrismaAdapter to encrypt refresh_token on save
const baseAdapter = PrismaAdapter(prisma);
const originalLinkAccount = baseAdapter.linkAccount?.bind(baseAdapter);
if (originalLinkAccount) {
  baseAdapter.linkAccount = async (account) => {
    if (account.refresh_token) account.refresh_token = enc(account.refresh_token);
    return originalLinkAccount(account);
  };
}

export const authOptions = {
  adapter: baseAdapter,
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
  callbacks: {
    async session({ session, user }) {
      // Include user.id in session for analytics tracking (opaque identifier, not PII)
      if (session?.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },
};

export default authOptions;
