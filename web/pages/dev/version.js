// web/pages/api/dev/version.js
export const config = { runtime: "nodejs" };

const COMMIT = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_REF || "unknown";
const BUILT_AT = new Date().toISOString();

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    commit: COMMIT,
    builtAt: BUILT_AT,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV || null,
    project: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
  });
}
