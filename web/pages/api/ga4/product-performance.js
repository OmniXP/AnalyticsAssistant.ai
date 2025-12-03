// pages/api/ga4/product-performance.js
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

// Build a GA4 filterExpression from the UI's "appliedFilters"
function buildDimensionFilter(filters) {
  // Normalize "Both" to "All" for backward compatibility
  const normalizedDeviceType = filters?.deviceType === "Both" ? "All" : (filters?.deviceType || "All");
  if (!filters || (filters.country === "All" && filters.channelGroup === "All" && normalizedDeviceType === "All")) return null;

  const andGroup = { andGroup: { expressions: [] } };

  if (filters.country && filters.country !== "All") {
    andGroup.andGroup.expressions.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: filters.country, caseSensitive: false },
      },
    });
  }

  if (filters.channelGroup && filters.channelGroup !== "All") {
    andGroup.andGroup.expressions.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: filters.channelGroup, caseSensitive: false },
      },
    });
  }

  // Use normalized deviceType
  const deviceType = normalizedDeviceType;
  if (deviceType && deviceType !== "All") {
    const deviceValue = deviceType === "Mobile" ? "mobile" : deviceType === "Desktop" ? "desktop" : deviceType.toLowerCase();
    andGroup.andGroup.expressions.push({
      filter: {
        fieldName: "deviceCategory",
        stringFilter: { matchType: "EXACT", value: deviceValue, caseSensitive: false },
      },
    });
  }

  if (andGroup.andGroup.expressions.length === 0) return null;
  return andGroup;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  try {
    const { propertyId, startDate, endDate, filters, limit = 100 } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    // IMPORTANT: item-scoped only (no session/user dimensions mixed).
    // Dimensions
    const dimensions = [{ name: "itemName" }, { name: "itemId" }];

    // Metrics (item scope)
    // - itemViews
    // - addToCarts
    // - itemPurchaseQuantity
    // - itemRevenue
    // - cartToViewRate (GA4 provides this, but if your property doesn’t, we can compute client-side)
    const metrics = [
      { name: "itemViews" },
      { name: "addToCarts" },
      { name: "itemPurchaseQuantity" },
      { name: "itemRevenue" },
      { name: "cartToViewRate" },
    ];

    const dimFilter = buildDimensionFilter(filters);

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions,
      metrics,
      // Sort by itemRevenue desc by default
      orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
      limit: Math.max(1, Math.min(5000, Number(limit) || 100)),
    };

    if (dimFilter) {
      body.dimensionFilter = dimFilter;
    }

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const apiRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ga.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await apiRes.json();
    if (!apiRes.ok) {
      return res.status(apiRes.status).json({
        error: "GA4 API error (products)",
        details: data,
      });
    }

    // Pass through raw response (the front-end will parse to a friendlier shape)
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
