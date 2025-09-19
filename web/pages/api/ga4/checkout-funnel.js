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

async function fetchEventCount({ accessToken, propertyId, startDate, endDate, eventName }) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { value: eventName },
      },
    },
    limit: 1,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!resp.ok) throw new Error(data?.error?.message || text || `HTTP ${resp.status}`);

  const count = Number(data?.rows?.[0]?.metricValues?.[0]?.value || 0);
  return count;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "No access token in session. Click 'Connect Google Analytics' then try again." });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  try {
    const accessToken = ga.access_token;

    // Safest, most compatible way: count specific events via eventName + eventCount
    const addToCart = await fetchEventCount({ accessToken, propertyId, startDate, endDate, eventName: "add_to_cart" });
    const beginCheckout = await fetchEventCount({ accessToken, propertyId, startDate, endDate, eventName: "begin_checkout" });
    const purchases = await fetchEventCount({ accessToken, propertyId, startDate, endDate, eventName: "purchase" });

    const rate = (num, den) => (den > 0 ? +( (num / den) * 100 ).toFixed(1) : 0);

    return res.status(200).json({
      steps: { addToCart, beginCheckout, purchases },
      rates: {
        cartToCheckoutPct: rate(beginCheckout, addToCart),
        checkoutToPurchasePct: rate(purchases, beginCheckout),
        cartToPurchasePct: rate(purchases, addToCart),
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
