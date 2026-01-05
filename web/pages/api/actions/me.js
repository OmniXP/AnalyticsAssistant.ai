import prisma from "../../../lib/prisma.js";
import { getDefaultScopesString, getBearerFromAuthHeader, validateAccessToken } from "../../../lib/server/chatgpt-oauth.js";
import { getGoogleTokensForEmail } from "../../../lib/server/ga4-session.js";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://app.analyticsassistant.ai";

function buildConnectUrl(nextPath = "") {
  try {
    const url = new URL("/start", APP_ORIGIN);
    url.searchParams.set("source", "chatgpt");
    if (nextPath) url.searchParams.set("next", nextPath);
    return url.toString();
  } catch {
    return "https://app.analyticsassistant.ai/start?source=chatgpt";
  }
}

function inferSiteType(profile) {
  const goal = (profile?.goal || "").toLowerCase();
  if (goal.includes("purchase") || goal.includes("cart") || goal.includes("checkout")) return "ecommerce";
  if (goal.includes("lead") || goal.includes("form") || goal.includes("signup")) return "leadgen";
  return "unknown";
}

function unauthorized(res) {
  return res.status(401).json({
    ok: false,
    error: "Unauthorized",
    code: "AUTH_REQUIRED",
    connectUrl: buildConnectUrl("/api/actions/reports/compare-28-days"),
  });
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

    const email = user.email || null;
    let hasGa4Tokens = false;
    if (email) {
      try {
        const tokens = await getGoogleTokensForEmail(email);
        hasGa4Tokens = !!tokens;
      } catch {
        hasGa4Tokens = false;
      }
    }
    const hasDefaultProperty = !!user.ga4PropertyId;

    return res.status(200).json({
      ok: true,
      userId: user.id,
      email,
      defaultPropertyId: user.ga4PropertyId || null,
      defaultPropertyName: user.ga4PropertyName || null,
      hasGa4Tokens,
      hasDefaultProperty,
      connectUrl: buildConnectUrl("/api/actions/reports/compare-28-days"),
      siteType: inferSiteType(user.profile),
      timezone: null,
      scope: tokenData.scopes?.join(" ") || getDefaultScopesString(),
    });
  } catch (e) {
    console.error("[actions/me] Error:", e);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}

