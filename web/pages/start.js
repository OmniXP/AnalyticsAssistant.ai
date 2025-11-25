// web/pages/start.js
import Link from "next/link";
import { signIn, getSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const PLAN_OPTIONS = [
  { plan: "monthly", label: "Go Pro — Monthly", helper: "Cancel anytime" },
  { plan: "annual", label: "Go Pro — Annual", helper: "Best value (save ~2 months)" },
];

const ERROR_MESSAGES = {
  Callback:
    "Google closed the window before finishing sign-in. Please try again and accept the permissions prompt.",
  OAuthCreateAccount:
    "We couldn’t save your Google profile to our database. Clear cookies for localhost or remove AnalyticsAssistant from https://myaccount.google.com/permissions, then try again.",
  AccessDenied: "Google reported that access was denied. Use the same Google account that owns your GA4 property.",
};

function resolveAuthError(code) {
  if (!code || typeof code !== "string") return "";
  return (
    ERROR_MESSAGES[code] ||
    "We couldn’t finish Google sign-in. Retry and accept the Analytics read-only + profile permissions."
  );
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

export default function StartPage({ signedIn, userEmail }) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [authError, setAuthError] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");

  const errorCode = router?.query?.error;
  const checkoutParam = router?.query?.checkout;

  useEffect(() => {
    if (!router.isReady) return;
    setAuthError(resolveAuthError(typeof errorCode === "string" ? errorCode : ""));
  }, [router.isReady, errorCode]);

  useEffect(() => {
    if (!router.isReady) return;
    if (checkoutParam === "canceled") {
      setCheckoutNotice("You left the Stripe checkout before finishing. No charges were made.");
    } else {
      setCheckoutNotice("");
    }
  }, [router.isReady, checkoutParam]);

  function dismissAuthError() {
    setAuthError("");
    if (!router.isReady) return;
    const nextQuery = { ...router.query };
    delete nextQuery.error;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }

  function handleSignIn() {
    signIn("google", { callbackUrl: "/start?upgrade=1" });
  }

  async function handleUpgrade(plan) {
    if (!signedIn) {
      handleSignIn();
      return;
    }

    try {
      setCheckoutError("");
      setCheckoutNotice("");
      setLoadingPlan(plan);
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Unable to start checkout. Please try again.");
      }
      window.location.href = data.url;
    } catch (err) {
      setCheckoutError(err.message || "Unable to start checkout. Please try again.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="aa-start">
      <div className="aa-shell">
        <section className="aa-hero aa-start__hero">
          <p className="aa-hero__eyebrow">Upgrade in two quick steps</p>
          <h1 className="aa-hero__title">
            Unlock Premium GA4 insights with the same Google account you use for Analytics.
          </h1>
          <p className="aa-hero__subtitle">
            We link subscriptions to{" "}
            <strong>{userEmail || "the Google account you sign in with"}</strong> so your billing,
            GA4 permissions, and AI summaries stay in sync.
          </p>

          {!signedIn ? (
            <div className="aa-hero__actions">
              <button className="aa-button aa-button--primary" type="button" onClick={handleSignIn}>
                Continue with Google
              </button>
              <Link className="aa-button aa-button--ghost" href="/">
                Back to dashboard
              </Link>
            </div>
          ) : (
            <>
              <div className="aa-start__plans">
                {PLAN_OPTIONS.map(({ plan, label, helper }) => (
                  <button
                    key={plan}
                    type="button"
                    className="aa-button aa-start__plan-btn"
                    data-variant={plan === "monthly" ? "primary" : "ghost"}
                    onClick={() => handleUpgrade(plan)}
                    disabled={loadingPlan !== null && loadingPlan !== plan}
                  >
                    {loadingPlan === plan ? "Opening Stripe…" : label}
                    <span>{helper}</span>
                  </button>
                ))}
              </div>
              <p className="aa-start__note">
                We’ll open Stripe in a new tab and link this plan to{" "}
                <strong>{userEmail || "your Google login"}</strong>. You can manage billing anytime
                via the “Manage billing” link in-app.
              </p>
            </>
          )}

          {checkoutError && <p className="aa-start__error">{checkoutError}</p>}

          {authError && (
            <div className="aa-alert aa-alert--danger">
              <span>{authError}</span>
              <button type="button" className="aa-alert__close" onClick={dismissAuthError}>
                Dismiss
              </button>
            </div>
          )}

          {checkoutNotice && <div className="aa-alert aa-alert--ghost">{checkoutNotice}</div>}

          <div className="aa-feature-callouts">
            <span>Secure Stripe checkout</span>
            <span>Premium linked to your Google login</span>
            <span>Cancel anytime via billing portal</span>
          </div>
        </section>

        <section className="aa-start__grid">
          <article className="aa-start-card">
            <h3>1. Sign in with the right Google account</h3>
            <p>
              Use the Google workspace or Gmail account that owns the GA4 property you want to
              analyse. We request read-only Analytics + profile scopes.
            </p>
            <ul>
              <li>Sign-in keeps subscriptions tied to the correct workspace.</li>
              <li>You can revoke access anytime from Google Security → Third-party access.</li>
            </ul>
          </article>

          <article className="aa-start-card">
            <h3>2. Connect GA4 & choose a property</h3>
            <p>
              After signing in, connect GA4 and set your default property so dashboards and AI
              summaries know where to pull data from.
            </p>
            <Link className="aa-button aa-button--ghost aa-start-card__cta" href="/connections">
              Open GA4 connections →
            </Link>
          </article>

          <article className="aa-start-card">
            <h3>Need help with upgrading?</h3>
            <p>
              Email <a href="mailto:support@analyticsassistant.ai">support@analyticsassistant.ai</a>{" "}
              and include the Google email you’re signing in with. Admins can also verify premium
              status via <code>/admin/users</code>.
            </p>
            <p style={{ color: "var(--aa-color-muted)" }}>
              After a successful checkout you’ll land on Insights with a green confirmation banner.
            </p>
          </article>
        </section>
      </div>
    </div>
  );
}
