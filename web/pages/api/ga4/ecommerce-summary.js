// /web/pages/api/ga4/ecommerce-summary.js
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const { propertyId, startDate, endDate, country, channel } = req.body || {};
    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const filterExpression = buildFilterExpression({
      country: normalise(country),
      channel: normalise(channel),
    });

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      // No item-level dimensions here -> avoids incompatibility with commerce metrics
      dimensions: [],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "purchaseRevenue" },          // revenue from purchases
        { name: "averagePurchaseRevenue" },   // AOV
        { name: "purchaserConversionRate" },  // CVR (purchasers / users)
      ],
      ...(filterExpression ? { dimensionFilter: filterExpression } : {}),
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
      return res.status(apiRes.status).json({ error: "GA4 API error (ecommerce-summary)", details: data });
    }

    // Flatten totals (since we didn't request dimensions, values will be in totals or the first row)
    const totals = {};
    const headers = (data?.metricHeaders || []).map((h) => h.name);
    const row = data?.rows?.[0]?.metricValues || [];
    headers.forEach((name, i) => {
      const raw = row[i]?.value ?? "0";
      totals[name] = Number(raw);
    });

    return res.status(200).json({
      totals,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error (ecommerce-summary)", details: String(e?.message || e) });
  }
}

function normalise(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "all") return null;
  return v;
}
