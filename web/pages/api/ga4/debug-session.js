// web/pages/api/ga4/debug-session.js
// Safe diagnostics for your GA session. No secrets returned.

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

// Use the same helper we rely on in summary:
const { getAccessTokenFromRequest } = require("../../../server/ga4-session");

const prisma = new PrismaClient();

export default async function handler(req, res) {
  try {
    const out = {
      signedIn: false,
      hasCookieHeader: !!req.headers?.cookie,
      cookieLength: (req.headers?.cookie || "").length,
      userEmail: null,
      userHasGA4: false,
      ga4PropertyId: null,
      tokenCheck: {
        sidFound: false,
        upstashRecordFound: false,
        hasAccessToken: false,
        hasRefreshToken: false,
        nowSec: Math.floor(Date.now() / 1000),
        expirySec: null,
        secondsUntilExpiry: null,
        refreshed: false,
        refreshError: null,
      },
    };

    // 1) app session
    const session = await getServerSession(req, res, authOptions);
    if (session?.user?.email) {
      out.signedIn = true;
      out.userEmail = session.user.email;

      // 2) do we have GA4 property stored?
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { ga4PropertyId: true },
      });
      out.userHasGA4 = !!user?.ga4PropertyId;
      out.ga4PropertyId = user?.ga4PropertyId || null;
    }

    // 3) Dig into the token store: we reuse the helper but augment it to expose internals
    // We'll inline some of the helper's logic here to introspect without leaking secrets.

    const crypto = require("crypto");
    const { Redis } = require("@upstash/redis");

    const APP_ENC_KEY = process.env.APP_ENC_KEY || "change_me_please_change_me_please_";
    const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "aa_auth";

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    function b64ToBufUrlSafe(str) {
      return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    }
    function decrypt(payload) {
      const raw = b64ToBufUrlSafe(payload);
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const data = raw.subarray(28);
      const key = crypto.createHash("sha256").update(APP_ENC_KEY).digest();
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(data), decipher.final()]);
      return dec.toString("utf8");
    }
    function readSessionIdFromRequest(req) {
      const cookieHeader = req.headers?.cookie || "";
      const parts = cookieHeader.split(";").map((s) => s.trim());
      const pair = parts.find((p) => p.startsWith(SESSION_COOKIE_NAME + "="));
      if (!pair) return null;
      const value = decodeURIComponent(pair.split("=").slice(1).join("="));
      try {
        const json = decrypt(value);
        const { sid } = JSON.parse(json);
        return sid || null;
      } catch {
        return null;
      }
    }

    const sid = readSessionIdFromRequest(req);
    if (sid) {
      out.tokenCheck.sidFound = true;

      const rec = await redis.hgetall(`aa:ga4:${sid}`);
      if (rec && Object.keys(rec).length) {
        out.tokenCheck.upstashRecordFound = true;
        const now = out.tokenCheck.nowSec;
        const expiry = rec.expiry ? parseInt(rec.expiry, 10) : 0;
        out.tokenCheck.expirySec = isFinite(expiry) ? expiry : null;
        out.tokenCheck.secondsUntilExpiry = expiry ? expiry - now : null;
        out.tokenCheck.hasAccessToken = !!rec.access_token;
        out.tokenCheck.hasRefreshToken = !!rec.refresh_token;

        // try to fetch access token the same way summary does
        try {
          const at = await getAccessTokenFromRequest(req);
          if (at) {
            out.tokenCheck.hasAccessToken = true;
          } else {
            out.tokenCheck.hasAccessToken = false;
          }
        } catch (e) {
          out.tokenCheck.refreshError = String(e?.message || e);
        }
      }
    }

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "debug failed", details: e.message });
  }
}
