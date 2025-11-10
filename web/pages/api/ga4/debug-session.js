// web/pages/api/ga4/debug-session.js
// Returns quick visibility into session cookie presence and bearer resolvability.

import { getBearerForRequest } from "../../lib/server/ga4-session.js";

function readCookie(req, name) {
  const raw = req.headers?.cookie || "";
  const parts = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf("=");
    const k = i >= 0 ? p.slice(0, i) : p;
    const v = i >= 0 ? p.slice(i + 1) : "";
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export default async function handler(req, res) {
  const aa_sid = readCookie(req, "aa_sid");
  const aa_auth = readCookie(req, "aa_auth");

  try {
    const { bearer, sid, source } = await getBearerForRequest(req);
    res.status(200).json({
      ok: true,
      cookies: { aa_sid: Boolean(aa_sid), aa_auth: Boolean(aa_auth) },
      sidResolved: sid || null,
      bearerSource: source || "unknown",
      hasBearer: Boolean(bearer),
    });
  } catch (e) {
    res.status(200).json({
      ok: false,
      cookies: { aa_sid: Boolean(aa_sid), aa_auth: Boolean(aa_auth) },
      error: e.code || "ERROR",
      message: e.message,
    });
  }
}
