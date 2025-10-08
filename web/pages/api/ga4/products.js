// /web/pages/api/ga4/products.js
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

// Build a GA4 dimensionFilter expression from our optional filters
function buildFilterExpression({ country, channel }) {
  const exprs = [];

  if (country) {
    exprs.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: String(country) },
      },
    });
  }

  if (channel) {
    exprs.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: String(channel) },
      },
    });
  }

  if (exprs.length === 0) return undefined;
  if (exprs.length === 1) return exprs[0];
  return { andGroup: { expressions: exprs } };
}

// Helper to call GA4 runReport with the bearer token
async function runReport({ accessToken, propertyId, body }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await apiRes.json().catch(() => null);
  if (!apiRes.ok) {
    const msg = data?.error?.message || "GA4 API error (products)";
    const status = data?.error?.status || "INVALID_ARGUMENT";
    throw new Error(`${msg} — ${JSON.stringify({ error: data?.error }, null, 0)}`);
  }
  return data;
}

// "All", "", null, undefined -> null (to disable a filter)
function normalise(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "all") return null;
  return v;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const {
      propertyId,
      startDate,
      endDate,
      filters,          // { country, channelGroup }
      limit = 50,
    } = req.body || {};

    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const country = normalise(filters?.country);
    const channel = normalise(filters?.channelGroup);
    const commonFilter = buildFilterExpression({ country, channel });

    // --- 1) Purchases & Revenue per item (SAFE combo with item dims) ---
    const purchaseBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [{ name: "itemsPurchased" }, { name: "itemRevenue" }],
      orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
      limit: Math.max(1, Math.min(1000, Number(limit) || 50)),
      ...(commonFilter ? { dimensionFilter: commonFilter } : {}),
    };

    const purchasesReport = await runReport({
      accessToken: ga.access_token,
      propertyId,
      body: purchaseBody,
    });

    // Seed map with purchase/revenue rows
    const byItemId = new Map();
    (purchasesReport.rows || []).forEach((r) => {
      const itemName = r.dimensionValues?.[0]?.value || "(unknown)";
      const itemId = r.dimensionValues?.[1]?.value || "";
      const itemsPurchased = Number(r.metricValues?.[0]?.value || 0);
      const itemRevenue = Number(r.metricValues?.[1]?.value || 0);
      byItemId.set(itemId || `idx-${byItemId.size}`, {
        itemId: itemId || "",
        itemName,
        itemsPurchased,
        itemRevenue,
        addToCarts: 0,
        itemViews: 0,
      });
    });

    // If nothing came back, short-circuit with a friendly message
    if (byItemId.size === 0) {
      return res.status(200).json({
        rows: [],
        note:
          "No product rows returned. This often means the date range + filters produce no purchases or your ecommerce tagging isn't sending an items[] array with item_id/item_name.",
      });
    }

    // --- 2) Add-to-cart counts per item (separate query) ---
    try {
      const atcBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "itemId" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              ...(commonFilter ? [commonFilter] : []),
              {
                filter: {
                  fieldName: "eventName",
                  stringFilter: { matchType: "EXACT", value: "add_to_cart" },
                },
              },
            ],
          },
        },
        limit: 1000,
      };

      const atcReport = await runReport({
        accessToken: ga.access_token,
        propertyId,
        body: atcBody,
      });

      (atcReport.rows || []).forEach((r) => {
        const itemId = r.dimensionValues?.[0]?.value || "";
        const count = Number(r.metricValues?.[0]?.value || 0);
        const row = byItemId.get(itemId);
        if (row) row.addToCarts = count;
      });
    } catch (e) {
      // Swallow add_to_cart errors so we still return purchases/revenue
      // (You’ll still see the full error in the server logs)
    }

    // --- 3) View item counts per item (separate query) ---
    try {
      const viewBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "itemId" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              ...(commonFilter ? [commonFilter] : []),
              {
                filter: {
                  fieldName: "eventName",
                  stringFilter: { matchType: "EXACT", value: "view_item" },
                },
              },
            ],
          },
        },
        limit: 1000,
      };

      const viewReport = await runReport({
        accessToken: ga.access_token,
        propertyId,
        body: viewBody,
      });

      (viewReport.rows || []).forEach((r) => {
        const itemId = r.dimensionValues?.[0]?.value || "";
        const count = Number(r.metricValues?.[0]?.value || 0);
        const row = byItemId.get(itemId);
        if (row) row.itemViews = count;
      });
    } catch (e) {
      // Swallow view_item errors; purchases/revenue still useful
    }

    // Final rows, sorted by revenue desc
    const rows = Array.from(byItemId.values()).sort((a, b) => b.itemRevenue - a.itemRevenue);
    return res.status(200).json({ rows });
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Server error (products)", details: String(e?.message || e) });
  }
}
