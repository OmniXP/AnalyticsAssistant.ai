// /workspaces/insightsgpt/web/pages/api/ga4/checkout-funnel.js
import { getIronSession } from "iron-session";

const sessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "insightgpt",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

const FUNNEL_STEPS = ["view_item", "add_to_cart", "begin_checkout", "add_payment_info", "purchase"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) {
    return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });
  }

  try {
    const { propertyId, startDate, endDate } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    // Pull event counts for just the steps we care about
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: FUNNEL_STEPS },
        },
      },
      keepEmptyRows: false,
      // No ordering guarantee; we’ll order on the server to your preferred sequence
    };

    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json().catch(() => null);
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({
        error: "GA4 API error (checkout funnel)",
        details: data || null,
      });
    }

    // Normalise into your step order, fill missing with 0
    const counts = Object.create(null);
    for (const r of data?.rows || []) {
      const name = r?.dimensionValues?.[0]?.value || "";
      const val = Number(r?.metricValues?.[0]?.value || 0);
      if (name) counts[name] = (counts[name] || 0) + val;
    }
    const rows = FUNNEL_STEPS.map((step) => ({ step, count: counts[step] || 0 }));

    return res.status(200).json({ rows });
  } catch (err) {
    return res.status(500).json({
      error: "Server error (checkout funnel)",
      details: String(err?.message || err),
    });
  }
}
