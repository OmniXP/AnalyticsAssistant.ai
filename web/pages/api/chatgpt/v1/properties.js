// web/pages/api/chatgpt/v1/properties.js
// List GA4 properties for ChatGPT users with plan-aware limits.

import { getGA4BearerForChatGPTUser, getChatGPTUserFromRequest } from "../../../../lib/server/chatgpt-auth.js";
import { withChatGPTUsageGuard, getUpgradeMessage } from "../../../../lib/server/chatgpt-usage.js";

const PROPERTY_LIMITS = {
  free: 1,
  premium: 5,
};

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const user = await getChatGPTUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: "ChatGPT authentication required", code: "AUTH_REQUIRED" });
    }

    const planKey = user.premium ? "premium" : "free";
    const limit = PROPERTY_LIMITS[planKey] ?? PROPERTY_LIMITS.free;

    const bearer = await getGA4BearerForChatGPTUser(user.chatgptUserId);

    // Get userinfo for email (best-effort)
    let email = user.email || null;
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${bearer}` },
      }).then(r => r.json());
      email = ui?.email || email;
    } catch {}

    // List properties via Admin API
    const url = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200";
    const r = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data?.error?.message || "Admin API error" });
    }

    const props = [];
    for (const acc of data?.accountSummaries || []) {
      for (const p of acc?.propertySummaries || []) {
        props.push({
          id: p?.property,
          displayName: p?.displayName,
          propertyType: p?.propertyType,
          account: acc?.account,
        });
      }
    }

    const limited = props.length > limit;
    const properties = limited ? props.slice(0, limit) : props;

    return res.status(200).json({
      ok: true,
      email,
      properties,
      total: props.length,
      limit,
      limited,
      ...(limited ? { upgrade: getUpgradeMessage(planKey, "ga4") } : {}),
    });
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("not connected") || msg.includes("connect your GA4 account")) {
      return res.status(401).json({
        ok: false,
        error: "Google Analytics not connected. Please connect your GA4 account first.",
        code: "GA4_NOT_CONNECTED",
      });
    }
    console.error("[chatgpt/v1/properties] Error:", e);
    return res.status(500).json({ ok: false, error: msg });
  }
}

export default withChatGPTUsageGuard("ga4", handler);
