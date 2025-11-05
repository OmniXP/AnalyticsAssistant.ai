// web/pages/api/dev/echo-cookies.js
export default async function handler(req, res) {
  const raw = req.headers?.cookie || "";
  const cookies = Object.fromEntries(
    raw
      .split(";")
      .map(s => s.trim())
      .filter(Boolean)
      .map(p => {
        const idx = p.indexOf("=");
        const k = idx >= 0 ? p.slice(0, idx) : p;
        const v = idx >= 0 ? p.slice(idx + 1) : "";
        return [k, v.length > 120 ? v.slice(0, 120) + "…(truncated)" : v];
      })
  );
  res.status(200).json({
    host: req.headers?.host || null,
    hasCookieHeader: !!raw,
    cookieCount: Object.keys(cookies).length,
    cookies,
  });
}
