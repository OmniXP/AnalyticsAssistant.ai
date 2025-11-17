// web/pages/api/dev/test-cookie.js
// Simple endpoint to test if cookies are being sent from the browser
export default function handler(req, res) {
  const cookieHeader = req.headers?.cookie || "none";
  const allHeaders = Object.keys(req.headers || {}).map(key => ({
    name: key,
    value: req.headers[key]?.substring(0, 100) || ""
  }));
  
  res.status(200).json({
    ok: true,
    cookieHeader,
    hasCookie: cookieHeader !== "none",
    allHeaders,
    method: req.method,
    url: req.url,
  });
}

