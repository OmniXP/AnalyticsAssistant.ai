// /pages/api/ga4/products.js
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

async function runReport({ accessToken, propertyId, body }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `GA4 API error (HTTP ${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const { propertyId, startDate, endDate, limit } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    // IMPORTANT:
    // Do NOT apply session-scoped filters (country, channel group) to item-scoped reports.
    // They frequently cause "incompatible" or silently empty results.
    // We'll add safe filtering later if needed.

    // Report A: item views + add to carts
    const bodyA = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [{ name: "itemViews" }, { name: "addToCarts" }],
      orderBys: [{ desc: true, metric: { metricName: "itemViews" } }],
      limit: Math.min(Number(limit || 100), 1000),
    };

    // Report B: item purchased qty + revenue
    const bodyB = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [{ name: "itemPurchaseQuantity" }, { name: "itemRevenue" }],
      orderBys: [{ desc: true, metric: { metricName: "itemPurchaseQuantity" } }],
      limit: Math.min(Number(limit || 100), 1000),
    };

    const [a, b] = await Promise.all([
      runReport({ accessToken: ga.access_token, propertyId, body: bodyA }),
      runReport({ accessToken: ga.access_token, propertyId, body: bodyB }),
    ]);

    // Merge rows by (itemName, itemId)
    const key = (r) =>
      `${r.dimensionValues?.[0]?.value || ""}||${r.dimensionValues?.[1]?.value || ""}`;

    const map = new Map();

    (a.rows || []).forEach((r) => {
      const k = key(r);
      const iv = Number(r.metricValues?.[0]?.value || 0); // itemViews
      const ac = Number(r.metricValues?.[1]?.value || 0); // addToCarts
      map.set(k, {
        name: r.dimensionValues?.[0]?.value || "(unknown)",
        id: r.dimensionValues?.[1]?.value || "",
        itemViews: iv,
        addToCarts: ac,
        itemsPurchased: 0,
        itemRevenue: 0,
      });
    });

    (b.rows || []).forEach((r) => {
      const k = key(r);
      const ip = Number(r.metricValues?.[0]?.value || 0); // itemPurchaseQuantity
      const rev = Number(r.metricValues?.[1]?.value || 0); // itemRevenue
      const existing = map.get(k);
      if (existing) {
        existing.itemsPurchased = ip;
        existing.itemRevenue = rev;
      } else {
        map.set(k, {
          name: r.dimensionValues?.[0]?.value || "(unknown)",
          id: r.dimensionValues?.[1]?.value || "",
          itemViews: 0,
          addToCarts: 0,
          itemsPurchased: ip,
          itemRevenue: rev,
        });
      }
    });

    let rows = Array.from(map.values());
    // Sort by itemViews desc, then purchased desc
    rows.sort((x, y) => (y.itemViews - x.itemViews) || (y.itemsPurchased - x.itemsPurchased));

    const noteParts = [];
    if (!rows.length) {
      noteParts.push(
        "No product rows returned. Check date range, filters, and GA4 e-commerce tagging."
      );
    }

    return res.status(200).json({
      rows,
      note: noteParts.length ? noteParts.join(" | ") : undefined,
      debug: { a, b }, // helps us see what GA returned
    });
  } catch (e) {
    const status = e?.status || 500;
    return res
      .status(status)
      .json({ error: "GA4 API error (products)", message: String(e?.message || e), details: e?.data });
  }
}