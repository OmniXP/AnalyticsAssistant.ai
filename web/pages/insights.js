// web/pages/insights.js
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { getServerSession } from "next-auth/next";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "../lib/authOptions";

const PREMIUM_LANDING_PATH = process.env.NEXT_PUBLIC_PREMIUM_URL || "/premium";

// --- Prisma (singleton to avoid hot-reload leaks locally)
let prisma;
if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  if (!global.__PRISMA__) global.__PRISMA__ = new PrismaClient();
  prisma = global.__PRISMA__;
}

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) {
    return { redirect: { destination: "/start", permanent: false } };
  }

  // Gate by premium flag
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { premium: true },
  });

  if (!user?.premium) {
    return { redirect: { destination: PREMIUM_LANDING_PATH, permanent: false } };
  }

  return { props: {} };
}

export default function InsightsPage() {
  // Correct way to read query string on the client
  const isSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/ga4/summary");
        const text = await r.text();
        let j = null;
        try {
          j = text ? JSON.parse(text) : null;
        } catch {}
        if (!r.ok) {
          throw new Error(j?.error || j?.message || text || `HTTP ${r.status}`);
        }
        if (mounted) setSummary(j);
      } catch (e) {
        if (mounted) setError(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div style={{ padding: 24 }}>
      {isSuccess && (
        <div
          style={{
            background: "#e6ffed",
            border: "1px solid #b7eb8f",
            padding: 12,
            marginBottom: 12,
            borderRadius: 6,
          }}
        >
          Payment successful — Pro unlocked.
        </div>
      )}

      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Insights</h1>
      <p style={{ marginTop: 0 }}>Welcome. Your GA4 summary appears below.</p>

      {loading && <p>Loading summary…</p>}
      {!loading && error && (
        <p style={{ color: "#d32f2f", whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}
      {!loading && !error && summary && (
        <div style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>
            Property: {summary.property}
          </h2>
          <p style={{ marginTop: 0 }}>{summary.period}</p>
          <ul>
            <li>
              Sessions: {summary.metrics.sessions.value} (
              {summary.metrics.sessions.changePct == null
                ? "n/a"
                : Math.round(summary.metrics.sessions.changePct) + "%"}
              )
            </li>
            <li>
              Users: {summary.metrics.users.value} (
              {summary.metrics.users.changePct == null
                ? "n/a"
                : Math.round(summary.metrics.users.changePct) + "%"}
              )
            </li>
            <li>
              Conversions: {summary.metrics.conversions.value} (
              {summary.metrics.conversions.changePct == null
                ? "n/a"
                : Math.round(summary.metrics.conversions.changePct) + "%"}
              )
            </li>
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await fetch("/api/stripe/portal", { method: "POST" });
              const j = await r.json().catch(() => ({}));
              if (r.ok && j?.url) {
                window.location.href = j.url;
              } else {
                alert("Unable to open billing portal.");
              }
            } catch (err) {
              alert("Unable to open billing portal.");
            }
          }}
        >
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Manage billing
          </button>
        </form>
      </div>
    </div>
  );
}
