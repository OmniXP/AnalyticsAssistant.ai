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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const session = await getIronSession(req, res, sessionOptions);
  const ga = session.gaTokens;
  if (!ga?.access_token) return res.status(401).json({ error: "Not connected" });

  const { propertyId, startDate, endDate } = req.body || {};
  if (!propertyId || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing propertyId/startDate/endDate" });
  }

  const steps = [
    { event: "view_item", label: "View item" },
    { event: "add_to_cart", label: "Add to cart" },
    { event: "begin_checkout", label: "Begin checkout" },
    { event: "add_shipping_info", label: "Add shipping info" },
    { event: "add_payment_info", label: "Add payment info" },
    { event: "purchase", label: "Purchase" },
  ];

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "totalUsers" }],
    // ✅ Correct filter shape: fieldName is a sibling of inListFilter, not inside it
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: {
          values: steps.map((s) => s.event),
          caseSensitive: false,
        },
      },
    },
    limit: "100",
  };

  const apiRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ga.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  // Try to parse JSON safely, but if GA returns HTML/text, keep it as string
  const raw = await apiRes.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}

  if (!apiRes.ok) {
    return res.status(apiRes.status).json({ error: data?.error?.message || raw || `HTTP ${apiRes.status}` });
  }

  const byEvent = Object.create(null);
  (data?.rows || []).forEach((r) => {
    const ev = r.dimensionValues?.[0]?.value || "";
    const users = Number(r.metricValues?.[0]?.value || 0);
    byEvent[ev] = users;
  });

  const rows = steps.map((s, i) => {
    const users = byEvent[s.event] ?? 0;
    const prevUsers = i === 0 ? users : (byEvent[steps[i - 1].event] ?? 0);
    const drop = prevUsers > 0 ? ((prevUsers - users) / prevUsers) * 100 : 0;
    return { step: s.label, users, dropoff: Math.max(0, drop) };
  });

  return res.status(200).json({ rows });
}
