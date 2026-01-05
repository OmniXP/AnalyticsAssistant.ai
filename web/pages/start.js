// web/pages/start.js
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../lib/authOptions";
import PlanCard from "../components/PlanCard";
import { PLAN_OPTIONS } from "../lib/plans";
import { PREMIUM_PROMISES } from "../lib/copy/premium";
import { requestBillingPortalUrl } from "../lib/billing";
import { trackEvent } from "../lib/analytics";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const CHATGPT_GPT_URL = process.env.NEXT_PUBLIC_CHATGPT_GPT_URL || "https://chat.openai.com";

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

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function getSafeCallbackDestination(callbackParam, req) {
  if (!callbackParam || !req) return null;
  const baseUrl = getBaseUrl(req);
  let decoded = callbackParam;
  try {
    decoded = decodeURIComponent(callbackParam);
  } catch {
    decoded = callbackParam;
  }
  try {
    const dest = new URL(decoded, baseUrl);
    const baseOrigin = new URL(baseUrl).origin;
    if (dest.origin !== baseOrigin) return null;
    return dest.pathname + dest.search + dest.hash;
  } catch {
    return null;
  }
}

const ERROR_MESSAGES = {
  Callback:
    "Google closed the window before finishing sign-in. Please try again and accept the permissions prompt.",
  OAuthCreateAccount:
    "We couldn’t save your Google profile to our database. Clear cookies for localhost or remove AnalyticsAssistant from https://myaccount.google.com/permissions, then try again.",
  access_denied:
    "Google reported access was denied. Please accept the requested permissions or try a different Google account.",
};

function resolveAuthError(code) {
  if (!code || typeof code !== "string") return "";
  return (
    ERROR_MESSAGES[code] ||
    "We couldn’t finish Google sign-in. Retry and accept the Analytics read-only + profile permissions."
  );
}

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const callbackParam = Array.isArray(ctx.query?.callbackUrl)
    ? ctx.query.callbackUrl[0]
    : ctx.query?.callbackUrl;
  if (session && callbackParam) {
    const destination = getSafeCallbackDestination(callbackParam, ctx.req);
    if (destination) {
      return {
        redirect: {
          destination,
          permanent: false,
        },
      };
    }
  }
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
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const signupTrackedRef = useRef(false);

  const errorCode = router?.query?.error;
  const checkoutParam = router?.query?.checkout;
  const sourceParam = router?.query?.source;
  const isChatGPTSource = sourceParam === "chatgpt";

  useEffect(() => {
    if (!router.isReady || signedIn) return;
    setAuthError(resolveAuthError(typeof errorCode === "string" ? errorCode : ""));
  }, [router.isReady, errorCode, signedIn]);

  useEffect(() => {
    if (!router.isReady) return;
    if (checkoutParam === "canceled") {
      setCheckoutNotice("You left the Stripe checkout before finishing. No charges were made.");
    } else {
      setCheckoutNotice("");
    }
  }, [router.isReady, checkoutParam]);

  useEffect(() => {
    if (signedIn && !signupTrackedRef.current) {
      trackEvent("signup_completed", { entry_point: "start_page" });
      signupTrackedRef.current = true;
    }
  }, [signedIn]);

  function dismissAuthError() {
    setAuthError("");
  }

  function handleSignIn() {
    const incomingCallback =
      typeof router?.query?.callbackUrl === "string"
        ? router.query.callbackUrl
        : Array.isArray(router?.query?.callbackUrl)
        ? router.query.callbackUrl[0]
        : "";

    let callbackUrl = resolveCallbackUrl("/start?upgrade=1");

    if (incomingCallback) {
      let decoded = incomingCallback;
      try {
        decoded = decodeURIComponent(incomingCallback);
      } catch {
        decoded = incomingCallback;
      }

      try {
        // Treat decoded as absolute or relative URL against current origin
        const url = new URL(decoded, typeof window !== "undefined" ? window.location.origin : undefined);
        const sameOrigin =
          typeof window !== "undefined" && url.origin === window.location.origin;
        if (sameOrigin && url.pathname.startsWith("/api/chatgpt/oauth/")) {
          callbackUrl = url.toString();
        }
      } catch {
        // Fallback: only accept relative paths that start with the ChatGPT OAuth prefix
        if (decoded.startsWith("/api/chatgpt/oauth/")) {
          callbackUrl = resolveCallbackUrl(decoded);
        }
      }
    }

    trackEvent("signup_started", { entry_point: "start_page" });
    signIn("google", { callbackUrl });
  }

  async function handleUpgrade(plan) {
    trackEvent("upgrade_cta_clicked", {
      plan_type: plan,
      entry_point: "start_plan_cards",
      signed_in: signedIn ? "true" : "false",
    });
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
    <div className="aa-start">
      <div className="aa-shell">
        <section className="aa-hero aa-start__hero">
          <p className="aa-hero__eyebrow">
            {isChatGPTSource ? "Connect GA4 for ChatGPT in two quick steps" : "Upgrade in two quick steps"}
          </p>
          <h1 className="aa-hero__title aa-hero__title--tight">
            {isChatGPTSource
              ? "Connect Google Analytics 4 so I can summarise your performance inside ChatGPT."
              : "Unlock Premium GA4 insights with the same Google account you use for Analytics."}
          </h1>
          <p className="aa-hero__subtitle">
            {isChatGPTSource ? (
              <>
                Use{" "}
                <strong>{userEmail || "the same Google account you use in Google Analytics"}</strong>{" "}
                so your GA4 data and ChatGPT summaries stay in sync.
              </>
            ) : (
              <>
                We link subscriptions to{" "}
                <strong>{userEmail || "the Google account you sign in with"}</strong> so your billing,
                GA4 permissions, and AI summaries stay in sync.
              </>
            )}
          </p>

          {isChatGPTSource && (
            <div className="aa-start__chatgpt-onboarding" style={{ marginTop: 24 }}>
              <p className="aa-start__note" style={{ fontWeight: 500 }}>
                Using AnalyticsAssistant from ChatGPT?
              </p>
              <ol style={{ margin: "8px 0 16px 20px", color: "#4b5563", fontSize: 14 }}>
                <li>Sign in with the same Google account you use in Google Analytics.</li>
                <li>Connect Google Analytics 4 and choose a default property.</li>
                <li>Return to ChatGPT and rerun your report.</li>
              </ol>
              <div
                className="aa-start__chatgpt-actions"
                style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}
              >
                <Link
                  href="/connections?source=chatgpt"
                  className="aa-button aa-button--primary"
                >
                  Connect GA4
                </Link>
                <a
                  href={CHATGPT_GPT_URL}
                  className="aa-button aa-button--ghost"
                  target="_blank"
                  rel="noreferrer"
                >
                  Return to ChatGPT
                </a>
              </div>
            </div>
          )}

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
            !isChatGPTSource && (
              <>
                <div className="aa-start__plans">
                  {PLAN_OPTIONS.map((option) => (
                    <PlanCard
                      key={option.plan}
                      option={option}
                      loadingPlan={loadingPlan}
                      onSelect={handleUpgrade}
                      priceSuffix="/ seat"
                    />
                  ))}
                </div>
                <p className="aa-start__note">
                  We’ll open Stripe in a new tab and link this plan to{" "}
                  <strong>{userEmail || "your Google login"}</strong>. You can manage or cancel anytime
                  via the billing portal.
                </p>
              </>
            )
          )}

          {checkoutError && <p className="aa-start__error">{checkoutError}</p>}

          {!signedIn && authError && (
            <div className="aa-alert aa-alert--danger">
              <span>{authError}</span>
              <button type="button" className="aa-alert__close" onClick={dismissAuthError}>
                Dismiss
              </button>
            </div>
          )}

          {checkoutNotice && <div className="aa-alert aa-alert--ghost">{checkoutNotice}</div>}

          {!isChatGPTSource && (
            <>
              <div className="aa-billing-hint">
                <span>
                  {signedIn
                    ? "Already upgraded? Open your Stripe billing portal in one click."
                    : "Already upgraded? Sign in so we can open your Stripe billing portal."}
                </span>
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

              <div className="aa-feature-callouts">
                {PREMIUM_PROMISES.map((promise) => (
                  <span key={promise}>{promise}</span>
                ))}
              </div>
            </>
          )}
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
              Email <a href="mailto:contact@analyticsassistant.ai">contact@analyticsassistant.ai</a>{" "}
              and include the Google email you’re signing in with. We will reply to all messages
              within 24 hours.
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
