// /workspaces/insightsgpt/web/pages/api/ga4/products.js
export default async function handler(req, res) {
  // Keep the route but mark it as temporarily disabled so the app never crashes
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  return res.status(501).json({
    error: "Product Performance is temporarily disabled while we add a more compatible query for your GA4 property.",
    hint: "Other sections will continue to work normally.",
  });
}
