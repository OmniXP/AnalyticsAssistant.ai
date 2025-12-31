import prisma from "../../../lib/prisma.js";
import { getDefaultScopesString, getBearerFromAuthHeader, validateAccessToken } from "../../../lib/server/chatgpt-oauth.js";

function inferSiteType(profile) {
  const goal = (profile?.goal || "").toLowerCase();
  if (goal.includes("purchase") || goal.includes("cart") || goal.includes("checkout")) return "ecommerce";
  if (goal.includes("lead") || goal.includes("form") || goal.includes("signup")) return "leadgen";
  return "unknown";
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, error: "Unauthorized", code: "AUTH_REQUIRED" });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const bearer = getBearerFromAuthHeader(req);
    const tokenData = await validateAccessToken(bearer);
    if (!tokenData?.userId) return unauthorized(res);

    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId },
      select: {
        id: true,
        email: true,
        ga4PropertyId: true,
        ga4PropertyName: true,
        profile: { select: { goal: true } },
      },
    });
    if (!user) return unauthorized(res);

    return res.status(200).json({
      ok: true,
      userId: user.id,
      email: user.email || null,
      defaultPropertyId: user.ga4PropertyId || null,
      defaultPropertyName: user.ga4PropertyName || null,
      siteType: inferSiteType(user.profile),
      timezone: null,
      scope: tokenData.scopes?.join(" ") || getDefaultScopesString(),
    });
  } catch (e) {
    console.error("[actions/me] Error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

