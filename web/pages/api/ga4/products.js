// /workspaces/insightsgpt/web/pages/api/ga4/products.js
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

async function runReport({ accessToken, propertyId, startDate, endDate, dimensionName, limit }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: dimensionName }], // itemName OR itemId
    metrics: [
      { name: "itemViews" },
      { name: "addToCarts" },
      { name: "itemsPurchased" },
      { name: "itemRevenue" },
    ],
    orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
    limit: String(limit ?? 50),
    keepEmptyRows: false,
  };

  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await apiRes.json().catch(() => null);
  return { ok: apiRes.ok, status: apiRes.status, data };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) {
    return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });
  }

  const { propertyId, startDate, endDate, limit = 50 } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  try {
    // 1) Try itemName first (most readable)
    let attempt = await runReport({
      accessToken: ga.access_token,
      propertyId, startDate, endDate,
      dimensionName: "itemName",
      limit,
    });

    // If GA returns an error, surface it
    if (!attempt.ok && attempt.status !== 400) {
      return res.status(attempt.status).json({
        error: "GA4 API error (products, itemName)",
        details: attempt.data || null,
      });
    }

    // Normalise rows
    const rows1 = (attempt.data?.rows || []).map((r, i) => ({
      name: r.dimensionValues?.[0]?.value || "(unknown)",
      id: `row-${i}`,
      itemsViewed: Number(r.metricValues?.[0]?.value || 0),
      itemsAddedToCart: Number(r.metricValues?.[1]?.value || 0),
      itemsPurchased: Number(r.metricValues?.[2]?.value || 0),
      itemRevenue: Number(r.metricValues?.[3]?.value || 0),
    }));

    if (rows1.length > 0) {
      return res.status(200).json({ rows: rows1, usedDimension: "itemName" });
    }

    // 2) Fallback to itemId (some implementations only send id)
    attempt = await runReport({
      accessToken: ga.access_token,
      propertyId, startDate, endDate,
      dimensionName: "itemId",
      limit,
    });

    if (!attempt.ok) {
      return res.status(attempt.status).json({
        error: "GA4 API error (products, itemId)",
        details: attempt.data || null,
      });
    }

    const rows2 = (attempt.data?.rows || []).map((r) => ({
      name: r.dimensionValues?.[0]?.value || "(unknown id)",
      id: r.dimensionValues?.[0]?.value || "",
      itemsViewed: Number(r.metricValues?.[0]?.value || 0),
      itemsAddedToCart: Number(r.metricValues?.[1]?.value || 0),
      itemsPurchased: Number(r.metricValues?.[2]?.value || 0),
      itemRevenue: Number(r.metricValues?.[3]?.value || 0),
    }));

    return res.status(200).json({
      rows: rows2,
      usedDimension: "itemId",
      note: rows2.length === 0
        ? "No product rows returned for this date range (itemName and itemId both empty). If GA’s E-commerce Purchases report shows items, ensure events include an items[] with item_id / item_name."
        : undefined,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Server error (products)",
      details: String(err?.message || err),
    });
  }
}
