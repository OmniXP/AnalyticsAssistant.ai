// web/pages/api/auth/google/callback.js
import { handleOAuthCallback } from "../../../../server/ga4-session.js";

export default async function handler(req, res) {
  try {
    const { code, state } = req.query || {};
    if (!code) return res.status(400).json({ ok: false, error: "Missing code" });

    const { sid } = await handleOAuthCallback({
      req,
      res,
      code: String(code),
      state: state ? String(state) : null,
    });

    // Try to respect state.redirect, otherwise send to home
    let redirectTo = "/";
    try {
      const parsed = state ? JSON.parse(state) : null;
      if (parsed?.redirect && typeof parsed.redirect === "string") redirectTo = parsed.redirect;
    } catch {}
    res.writeHead(302, { Location: redirectTo });
    res.end();
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
