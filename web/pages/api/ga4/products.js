// /pages/api/ga4/products.js
// ⬅️ If your other GA4 routes import from a different path, copy that EXACT path here:
import { getAccessToken } from "../auth/google/token";

/**
 * Build a GA4 dimensionFilter from our optional global filters
 */
function buildDimensionFilter(filters) {
  const and = [];
  if (filters?.country && filters.country !== "All") {
    and.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: filters.country },
      },
    });
  }
  if (filters?.channelGroup && filters.channelGroup !== "All") {
    and.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: filters.channelGroup },
      },
    });
  }
  return and.length ? { andGroup: { expressions: and } } : undefined;
}

/**
 * Call GA4 Data API
 */
async function runReport({ token, propertyId, body }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!resp.ok) {
    const msg = data?.error?.message || text || "GA4 API error";
    const err = new Error(msg);
    err.details = data;
    throw err;
  }
  return data || {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { propertyId, startDate, endDate, filters, limit = 200 } = req.body || {};
    if (!propertyId) return res.status(400).json({ error: "Missing propertyId" });

    const token = await getAccessToken();

    // ---------- Attempt 1: standard item breakdown (with filters) ----------
    const baseBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [
        // Keep to combos that are broadly compatible across properties
        { name: "itemPurchaseQuantity" }, // items purchased
        { name: "itemRevenue" },          // revenue attributed to item
        { name: "addToCarts" },           // add-to-carts (works for many props; if incompatible it'll fail)
      ],
      orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
      keepEmptyRows: false,
      limit: String(limit),
    };

    const dimFilter = buildDimensionFilter(filters);
    const body1 = dimFilter ? { ...baseBody, dimensionFilter: dimFilter } : baseBody;

    let data1;
    try {
      data1 = await runReport({ token, propertyId, body: body1 });
    } catch (e) {
      // If this fails due to incompatibility (e.g., addToCarts w/ item dims), try a safer metric set.
      const safeBody = {
        ...body1,
        metrics: [
          { name: "itemPurchaseQuantity" },
          { name: "itemRevenue" },
        ],
      };
      data1 = await runReport({ token, propertyId, body: safeBody });
    }

    if ((data1?.rowCount || 0) > 0) {
      return res.status(200).json({
        rows: data1.rows || [],
        metricHeaders: data1.metricHeaders || [],
        dimensionHeaders: data1.dimensionHeaders || [],
        rowCount: data1.rowCount || 0,
        note: null,
      });
    }

    // ---------- Attempt 2: remove filters entirely (rule out over-strict filters) ----------
    let data2;
    try {
      const body2 = { ...baseBody };
      // Use the "safe" metrics only to maximize compatibility
      body2.metrics = [
        { name: "itemPurchaseQuantity" },
        { name: "itemRevenue" },
      ];
      data2 = await runReport({ token, propertyId, body: body2 });
    } catch (e) {
      // If this fails it's a deeper API/config error
      return res.status(400).json({
        error: "GA4 API error (products)",
        details: e.details || { message: e.message },
      });
    }

    if ((data2?.rowCount || 0) > 0) {
      return res.status(200).json({
        rows: data2.rows || [],
        metricHeaders: data2.metricHeaders || [],
        dimensionHeaders: data2.dimensionHeaders || [],
        rowCount: data2.rowCount || 0,
        note: "Returned rows only after removing filters. Your current country / channel filters may exclude all product events.",
      });
    }

    // ---------- Attempt 3: diagnostic probe for purchase events w/ items ----------
    // Some setups send purchase but not view/add events with items[]. This probe asks:
    // "Do any purchase events have an items[] array for this date range?"
    const probeBody = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "itemName" }, { name: "itemId" }],
      metrics: [{ name: "itemPurchaseQuantity" }],
      keepEmptyRows: false,
      limit: "50",
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "eventName",
                stringFilter: { matchType: "EXACT", value: "purchase" },
              },
            },
          ],
        },
      },
    };

    let probe;
    try {
      probe = await runReport({ token, propertyId, body: probeBody });
    } catch (e) {
      // If even the probe fails, bubble that message up
      return res.status(400).json({
        error: "GA4 API error (products probe)",
        details: e.details || { message: e.message },
      });
    }

    const hasAnyItems = (probe?.rowCount || 0) > 0;

    return res.status(200).json({
      rows: [],
      rowCount: 0,
      note: hasAnyItems
        ? "We can see purchases with items[], but no item-level revenue/quantity matched your (date range / filters). Try widening the date range or clearing filters."
        : "No purchases with items[] were found for this date range. Check GA4 ‘Monetisation → E-commerce purchases’ and your tagging: view_item / add_to_cart / purchase must include an items[] array with item_id / item_name.",
      debug: {
        attempt1_withFilters: data1?.rowCount || 0,
        attempt2_noFilters: data2?.rowCount || 0,
        attempt3_purchaseProbe: probe?.rowCount || 0,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}