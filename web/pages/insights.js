// web/pages/insights.js
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { PrismaClient } from "@prisma/client";
import { authOptions } from "../lib/authOptions";
import { trackEvent } from "../lib/analytics";

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

  // Allow temporary access if checkout=success is present (webhook may not have processed yet)
  const checkoutSuccess = ctx.query?.checkout === "success";

  // Gate by premium flag (unless checkout success)
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { premium: true },
  });

  if (!user?.premium && !checkoutSuccess) {
    return { redirect: { destination: PREMIUM_LANDING_PATH, permanent: false } };
  }

  return { props: {} };
}

export default function InsightsPage() {
  const router = useRouter();
  // Read query string on the client
  const [checkoutStatus, setCheckoutStatus] = useState({ success: false, plan: null });
  const checkoutTrackedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const success = p.get("checkout") === "success";
    const plan = p.get("plan");
    setCheckoutStatus({ success, plan });
  }, []);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const bannerTitle = useMemo(() => {
  useEffect(() => {
    if (checkoutStatus.success && !checkoutTrackedRef.current) {
      trackEvent("upgrade_checkout_success", { plan: checkoutStatus.plan || "unknown" });
      checkoutTrackedRef.current = true;
    }
  }, [checkoutStatus]);

    if (!checkoutStatus.success) return null;
    if (checkoutStatus.plan === "annual") return "You're now on AnalyticsAssistant Premium — Annual.";
    if (checkoutStatus.plan === "monthly") return "You're now on AnalyticsAssistant Premium — Monthly.";
    return "You're now on AnalyticsAssistant Premium.";
  }, [checkoutStatus]);

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
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      {bannerTitle && (
        <div
          style={{
            margin: "0 auto 24px",
            borderRadius: 20,
            border: "1px solid rgba(76,110,245,0.25)",
            background:
              "linear-gradient(135deg, rgba(219,234,254,0.95), rgba(240,249,255,0.98))",
            boxShadow: "0 22px 60px rgba(15,23,42,0.12)",
            padding: "20px 24px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 18, color: "#1e40af" }}>{bannerTitle}</div>
            <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
              We've linked this subscription to the Google account you're signed in with now.
              If you sign in with a different Google account, Premium won't be available on that
              account.
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 20px",
                  borderRadius: 8,
                  fontWeight: 600,
                  color: "#fff",
                  background: "#4f46e5",
                  textDecoration: "none",
                  boxShadow: "0 4px 12px rgba(79,70,229,0.3)",
                }}
              >
                Go to Dashboard
              </Link>
              <button
                onClick={async (e) => {
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
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Manage Billing
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Insights</h1>
      <p style={{ marginTop: 0, color: "#6b7280" }}>Welcome. Your GA4 summary appears below.</p>

      {loading && <p style={{ color: "#6b7280" }}>Loading summary…</p>}
      {!loading && error && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 8,
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
      {!loading && !error && summary && (
        <div style={{ marginTop: 16, padding: 20, borderRadius: 12, border: "1px solid #e5e7eb", background: "#fff" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>
            Property: {summary.property}
          </h2>
          <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>{summary.period}</p>
          <ul style={{ marginTop: 12, paddingLeft: 20, color: "#374151" }}>
            <li style={{ marginBottom: 8 }}>
              Sessions: {summary.metrics.sessions.value} (
              {summary.metrics.sessions.changePct == null
                ? "n/a"
                : Math.round(summary.metrics.sessions.changePct) + "%"}
              )
            </li>
            <li style={{ marginBottom: 8 }}>
              Users: {summary.metrics.users.value} (
              {summary.metrics.users.changePct == null
                ? "n/a"
                : Math.round(summary.metrics.users.changePct) + "%"}
              )
            </li>
            <li style={{ marginBottom: 8 }}>
              Conversions: {summary.metrics.conversions.value} (
              {summary.metrics.conversions.changePct == null
                ? "n/a"
                : Math.round(summary.metrics.conversions.changePct) + "%"}
              )
            </li>
          </ul>
        </div>
      )}

      {!checkoutStatus.success && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={async (e) => {
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
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Manage Billing
          </button>
        </div>
      )}
    </div>
  );
}
