// web/pages/insights.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../lib/authOptions";
import { PrismaClient } from "@prisma/client";
import { useEffect, useState } from "react";

const prisma = new PrismaClient();

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) return { redirect: { destination: "/start", permanent: false } };

  // Load user and gate by premium
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user?.premium) {
    return { redirect: { destination: "/start?upgrade=1", permanent: false } };
  }

  return { props: {} };
}

export default function InsightsPage() {
  const isSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/ga4/summary");
        const j = await r.json();
        setSummary(j);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
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

      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Insights</h1>
      <p>Welcome. Your GA4 summary appears below.</p>

      {loading && <p>Loading summary…</p>}
      {!loading && summary && (
        <div style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Property: {summary.property}</h2>
          <p>{summary.period}</p>
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
            const r = await fetch("/api/stripe/portal", { method: "POST" });
            const j = await r.json();
            if (j?.url) window.location.href = j.url;
          }}
        >
          <button type="submit" style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc" }}>
            Manage billing
          </button>
        </form>
      </div>
    </div>
  );
}
