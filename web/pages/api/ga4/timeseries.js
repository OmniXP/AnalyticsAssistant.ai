// /workspaces/insightsgpt/web/pages/api/ga4/timeseries.js
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

function buildDimensionFilter(filters) {
  // filters = { country: "All" | "<name>", channelGroup: "All" | "<group>" }
  const andFilters = [];

  if (filters?.country && filters.country !== "All") {
    andFilters.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: String(filters.country), caseSensitive: false },
      },
    });
  }
  if (filters?.channelGroup && filters.channelGroup !== "All") {
    andFilters.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: String(filters.channelGroup), caseSensitive: false },
      },
    });
  }

  if (andFilters.length === 0) return undefined;
  if (andFilters.length === 1) return andFilters[0];
  return { andGroup: { expressions: andFilters } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");
  try {
    const session = await getIronSession(req, res, sessionOptions);
    const ga = session.gaTokens;
    if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

    const {
      propertyId,
      startDate,
      endDate,
      filters = { country: "All", channelGroup: "All" },
      granularity = "daily", // "daily" | "weekly"
    } = req.body || {};

    if (!propertyId || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
    }

    const dimensionName = granularity === "weekly" ? "yearWeek" : "date";

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        // Ecommerce metrics will simply be 0 if there's no ecommerce, but GA4 allows them in the schema:
        { name: "transactions" },
        { name: "totalRevenue" },
      ],
      dimensions: [{ name: dimensionName }],
      dimensionFilter: buildDimensionFilter(filters),
      orderBys: [{ dimension: { dimensionName }, desc: false }],
      limit: 100000,
    };

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
        error: "GA4 API error (timeseries)",
        details: data,
      });
    }

    // Normalize into a simple series array the UI can use directly
    const series = (data.rows || []).map((r) => {
      const key = r.dimensionValues?.[0]?.value || "";
      const sessions = Number(r.metricValues?.[0]?.value || 0);
      const users = Number(r.metricValues?.[1]?.value || 0);
      const transactions = Number(r.metricValues?.[2]?.value || 0);
      const revenue = Number(r.metricValues?.[3]?.value || 0);
      return { period: key, sessions, users, transactions, revenue };
    });

    res.status(200).json({
      granularity,
      dimension: dimensionName,
      series,
      raw: data,
    });
  } catch (e) {
    res.status(500).json({ error: "Server error (timeseries)", message: String(e?.message || e) });
  }
}
