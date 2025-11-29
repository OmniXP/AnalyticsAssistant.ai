import Link from "next/link";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import PlanCard from "../components/PlanCard";
import { PLAN_OPTIONS } from "../lib/plans";
import { requestBillingPortalUrl } from "../lib/billing";
import { PREMIUM_FEATURES, PREMIUM_PROMISES, PREMIUM_WHY } from "../lib/copy/premium";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

function resolveCallbackUrl(pathname) {
  if (typeof window !== "undefined") {
    return new URL(pathname, window.location.origin).toString();
  }
  if (APP_URL) {
    try {
      return new URL(pathname, APP_URL).toString();
    } catch {
      return pathname;
    }
  }
  return pathname;
}

export async function getServerSideProps(ctx) {
  const session = await getSession({ req: ctx.req });
  return {
    props: {
      signedIn: !!session,
      userEmail: session?.user?.email || null,
    },
  };
}

const PRICE_ENV_HINT =
  "Missing Stripe price IDs. Set STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_ANNUAL in web/.env.local (use your price_xxx IDs from Stripe).";

function formatCheckoutError(message = "") {
  if (/invalid or missing price/i.test(message)) {
    return `${message}. ${PRICE_ENV_HINT}`;
  }
  return message || "Unable to start checkout. Please try again.";
}

export default function PremiumPage({ signedIn, userEmail }) {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState("");
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);

  function handleSignIn() {
    const callbackUrl = resolveCallbackUrl("/premium");
    signIn("google", { callbackUrl });
  }

  async function handleUpgrade(plan = "monthly") {
    if (!signedIn) {
      handleSignIn();
      return;
    }
    try {
      setError("");
      setLoadingPlan(plan);
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "Unable to start checkout. Please try again.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(formatCheckoutError(err.message));
      setLoadingPlan(null);
    }
  }

  async function handleBillingPortal() {
    if (!signedIn) {
      handleSignIn();
      return;
    }

    try {
      setBillingError("");
      setBillingLoading(true);
      const url = await requestBillingPortalUrl();
      window.location.href = url;
    } catch (err) {
      setBillingError(err.message || "Unable to open the billing portal right now.");
    } finally {
      setBillingLoading(false);
    }
  }

  return (
    <div className="aa-start aa-premium">
      <div className="aa-shell">
        <section className="aa-hero aa-start__hero">
          <p className="aa-hero__eyebrow">Your cost-effective growth plan</p>
          <h1 className="aa-hero__title aa-hero__title--tight">
            Premium GA4 insights without the friction.
          </h1>
          <p className="aa-hero__subtitle">
            Adding deeper GA4 views, AI PRO insights, and automation so you always know what to do next. We keep
            everything tied to{" "}
            <strong>{userEmail || "the Google account you use for Analytics"}</strong> for billing, permissions, and AI.
          </p>
          {!signedIn && (
            <div className="aa-hero__actions">
              <button className="aa-button aa-button--primary" type="button" onClick={handleSignIn}>
                Continue with Google
              </button>
              <Link className="aa-button aa-button--ghost" href="/start">
                See onboarding steps
              </Link>
            </div>
          )}
          <div className="aa-start__plans aa-premium__plans">
            {PLAN_OPTIONS.map((option) => (
              <PlanCard
                key={option.plan}
                option={option}
                loadingPlan={loadingPlan}
                onSelect={handleUpgrade}
                ctaLabel={signedIn ? "Upgrade now" : "Continue with Google"}
              />
            ))}
          </div>
          <p className="aa-start__note">
            Premium Annual is <strong>$24/mo</strong> (billed annually) and saves roughly 17% compared to Premium Monthly
            at <strong>$29/mo</strong>. Pick what fits your cash flow—Stripe opens in a new tab.
          </p>
          <div className="aa-billing-hint">
            <span>Need to cancel or change seats? Use the Stripe billing portal anytime.</span>
            <button
              type="button"
              className="aa-button aa-button--ghost"
              onClick={handleBillingPortal}
              disabled={billingLoading}
            >
              {billingLoading ? "Opening billing portal…" : "Manage billing"}
            </button>
            {billingError && <p className="aa-billing-hint__error">{billingError}</p>}
          </div>
          {error && <p className="aa-start__error">{error}</p>}
          <div className="aa-feature-callouts">
            {PREMIUM_PROMISES.map((promise) => (
              <span key={promise}>{promise}</span>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>Why go Premium?</h2>
          <p style={{ color: "#475569", maxWidth: 720 }}>
            Free is perfect for quick checks and trying the workflow. Premium is for when GA4 becomes part of how you run
            the business every week, not once a quarter.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18,
              marginTop: 24,
            }}
          >
            {PREMIUM_WHY.map((item) => (
              <Card key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>What you get with Premium</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 18,
              marginTop: 16,
            }}
          >
            {PREMIUM_FEATURES.map((item) => (
              <Card key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 14 }}>Free vs Premium</h2>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={thStyle}></th>
                <th style={thStyle}>Free</th>
                <th style={thStyle}>Premium</th>
              </tr>
            </thead>
            <tbody>
              <Row label="GA4 reports per month" free="For occasional checks" pro="For weekly use by teams" />
              <Row label="AI summaries per month" free="Just enough to try" pro="Run AI on every key report" />
              <Row label="GA4 properties" free="1 property" pro="Up to 5 properties" />
              <Row label="Data lookback" free="Last 90 days" pro="Full GA4 history (per GA retention)" />
              <Row label="Premium dashboards" free="Core KPIs only" pro="Campaigns, landing pages, advanced trends" />
              <Row label="Summarise with AI PRO" free="Standard summaries" pro="Hypotheses, playbooks, backlog" />
              <Row label="Slack digests & automation" free="Not included" pro="Scheduled Slack digests" />
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 48, background: "#f8fafc", borderRadius: 16, padding: 24 }}>
          <p style={{ fontSize: 18, fontStyle: "italic", color: "#0f172a", marginBottom: 8 }}>
            “Instead of wrangling GA4 every Monday, we open AnalyticsAssistant, skim the Premium summary, and update our
            roadmap. It’s like having an analyst on standby.”
          </p>
          <p style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>— Growth Lead, DTC brand</p>
        </section>

        <section style={{ textAlign: "center", marginBottom: 64 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
            Ready to make GA4 part of your weekly operating system?
          </h2>
          <p style={{ color: "#475569", maxWidth: 640, margin: "0 auto 20px" }}>
            Upgrade to AnalyticsAssistant Premium and turn analytics from a reporting chore into a repeatable growth habit.
          </p>
          <div className="aa-start__plans" style={{ marginTop: 24 }}>
            {PLAN_OPTIONS.map((option) => (
              <PlanCard
                key={`${option.plan}-cta`}
                option={option}
                loadingPlan={loadingPlan}
                onSelect={handleUpgrade}
                ctaLabel={signedIn ? "Upgrade now" : "Continue with Google"}
              />
            ))}
          </div>
          <p style={{ marginTop: 12 }}>
            or{" "}
            <Link href="/" style={{ color: "#2563EB" }}>
              keep exploring the Free plan →
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

function Card({ title, body }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", padding: 18, background: "#FFFFFF" }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</h3>
      <p style={{ color: "#475569", fontSize: 14 }}>{body}</p>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #E2E8F0",
  background: "#F8FAFC",
  fontSize: 13,
  color: "#475569",
};

function Row({ label, free, pro }) {
  return (
    <tr>
      <td style={{ padding: 10, borderBottom: "1px solid #E2E8F0", fontWeight: 600 }}>{label}</td>
      <td style={{ padding: 10, borderBottom: "1px solid #E2E8F0", color: "#475569" }}>{free}</td>
      <td style={{ padding: 10, borderBottom: "1px solid #E2E8F0", color: "#0f172a", fontWeight: 600 }}>{pro}</td>
    </tr>
  );
}

