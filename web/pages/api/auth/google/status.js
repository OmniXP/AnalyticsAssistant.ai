// web/pages/api/auth/google/status.js
import { readSidFromCookie, getGoogleTokens, isExpired } from "../../../../lib/server/ga4-session.js";

async function tryRefreshIfNeeded(sid, tokens) {
  // Lazy import to avoid circular imports
  const mod = await import("../../../../lib/server/ga4-session.js");
  if (isExpired(tokens)) {
    try {
      const refreshed = await mod.default?.refreshGoogleTokens?.(sid, tokens); // if default export existed
      // above line may not exist, so call the named export directly:
    } catch (_) { /* ignore */ }
  }
}

export default async function handler(req, res) {
  try {
    const mod = await import("../../../../lib/server/ga4-session.js");
    const sid = readSidFromCookie(req);
    if (!sid) return res.status(200).json({ ok: true, hasTokens: false, expired: true });

    let tokens = await getGoogleTokens(sid);
    if (!tokens) return res.status(200).json({ ok: true, hasTokens: false, expired: true });

    if (isExpired(tokens)) {
      try {
        // refresh and re-read
        const refreshed = await mod.saveGoogleTokens(
          sid,
          await (async () => {
            const params = new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID || "",
              client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
              grant_type: "refresh_token",
              refresh_token: tokens.refresh_token || "",
            });
            const r = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: params.toString(),
            });
            if (!r.ok) throw new Error(`Refresh failed: ${r.status}`);
            return await r.json();
          })()
        );
        tokens = refreshed;
      } catch (_) {
        // If refresh fails, fall through and report expired
      }
    }

    res.status(200).json({
      ok: true,
      hasTokens: Boolean(tokens),
      expired: isExpired(tokens),
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message || String(e) });
  }
}
