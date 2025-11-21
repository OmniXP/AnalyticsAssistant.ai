import { assertCsvDownloadAllowance } from "../../../lib/server/usage-limits.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const result = await assertCsvDownloadAllowance(req, res);
    return res.status(200).json({ ok: true, remaining: result.remaining });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({
      ok: false,
      error: err?.message || "Unable to track CSV download usage",
      code: err?.code || "CSV_ERROR",
      limit: err?.meta || null,
    });
  }
}

