// web/pages/api/dev/version.js
export const config = { runtime: "nodejs" };

const meta = {
  commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF || "unknown",
  builtAt: new Date().toISOString(),
  nodeEnv: process.env.NODE_ENV || null,
  vercelEnv: process.env.VERCEL_ENV || null,
  projectUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
};

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, ...meta });
}
