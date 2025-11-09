// web/pages/dev/version.js
// Server-only page to display build/env info. Prevents static export.

export const config = { runtime: "nodejs" };
export const dynamic = "force-dynamic";

export async function getServerSideProps() {
  let pkg = { name: "unknown", version: "0.0.0" };
  try {
    // Resolve relative to the Next.js "web" package root
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    pkg = require("../../package.json");
  } catch {
    // ignore
  }

  const info = {
    appName: pkg.name || "web",
    appVersion: pkg.version || "0.0.0",
    nodeEnv: process.env.NODE_ENV || "unknown",
    vercelEnv: process.env.VERCEL_ENV || null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    builtAt: new Date().toISOString(),
  };

  return { props: { info } };
}

export default function VersionPage({ info }) {
  return (
    <div style={{ padding: 20, fontFamily: "ui-sans-serif, system-ui, -apple-system" }}>
      <h1>Build / Version</h1>
      <pre
        style={{
          marginTop: 10,
          background: "#f8f8f8",
          padding: 12,
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {JSON.stringify(info, null, 2)}
      </pre>
    </div>
  );
}
