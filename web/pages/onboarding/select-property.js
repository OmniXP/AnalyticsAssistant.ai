// web/pages/onboarding/select-property.js
// Property selection page for ChatGPT onboarding flow

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import ChatgptOnboardingShell from "../../components/ChatgptOnboardingShell";
import ConnectGA4Button from "../../components/ConnectGA4Button";

const CHATGPT_GPT_URL =
  process.env.NEXT_PUBLIC_CHATGPT_GPT_URL ||
  "https://chatgpt.com/g/g-693ca32862c08191b80569e2fe240da3-analyticsassistant-ai-for-ga4";
const PREMIUM_URL = process.env.PREMIUM_URL || process.env.NEXT_PUBLIC_PREMIUM_URL || "https://analyticsassistant.ai/premium";

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.email) {
    const source = ctx.query.source || "";
    const next = ctx.query.next || "";
    const callbackUrl = `/onboarding/select-property?source=${source}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
    return {
      redirect: {
        destination: `/start?source=chatgpt&callbackUrl=${encodeURIComponent(callbackUrl)}`,
        permanent: false,
      },
    };
  }

  // Check if user already has a default property set
  const prisma = (await import("../../lib/prisma.js")).default;
  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
      select: { ga4PropertyId: true, ga4PropertyName: true },
    });
    if (user?.ga4PropertyId) {
      // Already has property, show success state
      return { props: { alreadySet: true, propertyName: user.ga4PropertyName || null } };
    }
  } catch (e) {
    console.error("[select-property] Error checking user property:", e);
  }

  return { props: { alreadySet: false } };
}

export default function SelectPropertyPage({ alreadySet, propertyName }) {
  const router = useRouter();
  const [ga4Connected, setGa4Connected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(alreadySet);
  const [error, setError] = useState(null);
  const [propertyLimitError, setPropertyLimitError] = useState(null);

  const isChatGPTSource = router.query.source === "chatgpt";

  // Check GA4 connection status
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/google/status", { cache: "no-store" });
        const data = await res.json();
        if (data?.hasTokens && !data?.expired) {
          setGa4Connected(true);
          // Fetch properties
          await loadProperties();
        } else {
          setGa4Connected(false);
        }
      } catch (e) {
        console.error("Status check error:", e);
        setGa4Connected(false);
      } finally {
        setCheckingConnection(false);
      }
    })();
  }, []);

  async function loadProperties() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ga4/properties", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load properties");
      }
      setProperties(data?.properties || []);
      // If only one property, preselect it
      if (data?.properties?.length === 1) {
        setSelectedProperty(data.properties[0]);
      }
    } catch (e) {
      setError(e.message || "Failed to load GA4 properties");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedProperty) return;
    setSaving(true);
    setError(null);
    setPropertyLimitError(null);
    try {
      const res = await fetch("/api/ga4/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: selectedProperty.id,
          propertyName: selectedProperty.displayName || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "PROPERTY_LIMIT") {
          setPropertyLimitError({
            message: data.error || "Property limit reached",
            limit: data.limit,
          });
        } else {
          setError(data?.error || "Failed to save property selection");
        }
        setSaving(false);
        return;
      }
      setSuccess(true);
    } catch (e) {
      setError(e.message || "Failed to save property selection");
      setSaving(false);
    }
  }

  const filteredProperties = properties.filter((p) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.displayName?.toLowerCase().includes(query) ||
      p.id?.toLowerCase().includes(query) ||
      p.account?.toLowerCase().includes(query)
    );
  });

  // Build redirect path that preserves query params
  const buildRedirectPath = () => {
    const currentPath = router.asPath.split("?")[0];
    const query = new URLSearchParams();
    query.set("source", "chatgpt");
    if (router.query.next) {
      query.set("next", router.query.next);
    }
    return `${currentPath}?${query.toString()}`;
  };

  // Loading state
  if (checkingConnection) {
    const content = (
      <div className="aa-hero">
        <div className="aa-hero__title" style={{ marginBottom: 24 }}>
          <div className="animate-spin h-8 w-8 border-2 border-[var(--aa-primary)] border-t-transparent rounded-full mx-auto mb-4" />
          <p style={{ color: "var(--aa-color-muted)", fontSize: 16 }}>Checking GA4 connection...</p>
        </div>
      </div>
    );
    return isChatGPTSource ? <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell> : <main>{content}</main>;
  }

  // State A: GA4 Not Connected (inline for ChatGPT, redirect for web)
  if (!ga4Connected) {
    if (isChatGPTSource) {
      const content = (
        <div className="aa-hero">
          <p className="aa-hero__eyebrow">Step 1 of 2</p>
          <h1 className="aa-hero__title aa-hero__title--tight">
            Connect GA4 so I can run reports in ChatGPT
          </h1>
          <p className="aa-hero__subtitle">
            Connect your Google Analytics 4 account once — then I'll use it in ChatGPT to pull fresh insights and explain what changed, why, and what to do next.
          </p>
          <div className="aa-hero__actions">
            <ConnectGA4Button redirectPath={buildRedirectPath()} />
          </div>
          <div className="aa-feature-callouts">
            <span>Secure OAuth 2.0 connection</span>
            <span>Read-only access</span>
            <span>No data stored beyond metrics</span>
          </div>
        </div>
      );
      return <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell>;
    } else {
      // Non-ChatGPT: redirect to /onboard (preserve existing behavior)
      router.replace(`/onboard${router.query.next ? `?next=${encodeURIComponent(router.query.next)}` : ""}`);
      return (
        <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-600">Redirecting...</p>
        </main>
      );
    }
  }

  // State C: Success (property already set or just saved)
  if (success) {
    const finalPropertyName = propertyName || selectedProperty?.displayName || "your property";
    if (isChatGPTSource) {
      const content = (
        <div className="aa-hero">
          <div style={{ fontSize: 48, marginBottom: 24, color: "var(--aa-color-positive)" }}>✓</div>
          <h1 className="aa-hero__title aa-hero__title--tight">
            You're all set
          </h1>
          <p className="aa-hero__subtitle">
            GA4 is connected and <strong>{finalPropertyName}</strong> is your default for ChatGPT reports.
          </p>
          <p style={{ color: "var(--aa-color-muted)", fontSize: 15, marginTop: 12, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Go back to ChatGPT and repeat your request — I'll now pull fresh data from your GA4 property.
          </p>
          <div className="aa-hero__actions">
            <a
              href={CHATGPT_GPT_URL}
              target="_blank"
              rel="noreferrer"
              className="aa-button aa-button--primary"
              style={{ fontSize: 16, padding: "14px 28px" }}
            >
              Return to ChatGPT
            </a>
            <a
              href="/"
              className="aa-button aa-button--ghost"
            >
              Open Dashboard
            </a>
          </div>
        </div>
      );
      return <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell>;
    } else {
      // Non-ChatGPT: simple success message
      return (
        <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <div className="text-green-600 text-4xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Property Selected</h1>
          <p className="text-gray-600 mb-4">
            {finalPropertyName
              ? `Default GA4 property set to: ${finalPropertyName}`
              : "Your default GA4 property has been saved."}
          </p>
        </main>
      );
    }
  }

  // Loading properties
  if (loading) {
    const content = (
      <div className="aa-hero">
        <div className="aa-hero__title" style={{ marginBottom: 24 }}>
          <div className="animate-spin h-8 w-8 border-2 border-[var(--aa-primary)] border-t-transparent rounded-full mx-auto mb-4" />
          <p style={{ color: "var(--aa-color-muted)", fontSize: 16 }}>Loading GA4 properties...</p>
        </div>
      </div>
    );
    return isChatGPTSource ? <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell> : <main>{content}</main>;
  }

  // Error loading properties
  if (error && !properties.length) {
    const content = (
      <div className="aa-hero">
        <div style={{ fontSize: 48, marginBottom: 24, color: "var(--aa-color-negative)" }}>⚠️</div>
        <h1 className="aa-hero__title aa-hero__title--tight">Error Loading Properties</h1>
        <p className="aa-hero__subtitle">{error}</p>
        <div className="aa-hero__actions">
          <button onClick={loadProperties} className="aa-button aa-button--primary">
            Retry
          </button>
        </div>
      </div>
    );
    return isChatGPTSource ? <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell> : <main>{content}</main>;
  }

  // No properties found
  if (properties.length === 0) {
    const content = (
      <div className="aa-hero">
        <div style={{ fontSize: 48, marginBottom: 24, color: "var(--aa-color-muted)" }}>⚠️</div>
        <h1 className="aa-hero__title aa-hero__title--tight">No GA4 Properties Found</h1>
        <p className="aa-hero__subtitle">
          Your Google account doesn't have access to any GA4 properties yet. Please create or request access to a GA4 property in Google Analytics first.
        </p>
        <div className="aa-hero__actions">
          <a
            href="https://analytics.google.com"
            target="_blank"
            rel="noreferrer"
            className="aa-button aa-button--primary"
          >
            Open Google Analytics
          </a>
        </div>
      </div>
    );
    return isChatGPTSource ? <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell> : <main>{content}</main>;
  }

  // State B: Property Selection
  const content = (
    <div>
      <div className="aa-hero">
        <p className="aa-hero__eyebrow">{isChatGPTSource ? "Step 2 of 2" : "Select Property"}</p>
        <h1 className="aa-hero__title aa-hero__title--tight">
          {isChatGPTSource ? "Choose your default GA4 property" : "Select Your Default GA4 Property"}
        </h1>
        <p className="aa-hero__subtitle">
          {isChatGPTSource
            ? "This property will be used for all ChatGPT reports unless you specify a different one."
            : "Choose the GA4 property you want to use as your default."}
          {properties.length === 1 && (
            <span style={{ display: "block", marginTop: 8, fontSize: 15 }}>
              We've preselected your only GA4 property.
            </span>
          )}
        </p>
      </div>

      {propertyLimitError && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: "var(--aa-r-card-tight)",
            border: "1px solid rgba(234, 179, 8, 0.4)",
            background: "rgba(254, 252, 232, 0.9)",
            color: "var(--aa-color-ink)",
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 8 }}>{propertyLimitError.message}</p>
          <p style={{ fontSize: 14, marginBottom: 12, color: "var(--aa-color-muted)" }}>
            {propertyLimitError.limit?.plan === "free"
              ? "Free plan supports 1 GA4 property. Upgrade to Premium to connect up to 5 properties."
              : "Premium plan supports up to 5 GA4 properties. Remove one before adding another."}
          </p>
          <a
            href={PREMIUM_URL}
            target="_blank"
            rel="noreferrer"
            className="aa-button aa-button--primary"
            style={{ fontSize: 14, padding: "10px 20px" }}
          >
            Upgrade to Premium
          </a>
        </div>
      )}

      {error && !propertyLimitError && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: "var(--aa-r-card-tight)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background: "rgba(254, 242, 242, 0.9)",
            color: "var(--aa-color-negative)",
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {properties.length > 1 && (
        <div style={{ marginTop: 24 }}>
          <input
            type="text"
            placeholder="Search properties by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "var(--aa-r-card-tight)",
              border: "1px solid var(--aa-color-border)",
              background: "var(--aa-color-surface)",
              fontFamily: "var(--aa-font-body)",
              fontSize: 15,
              outline: "none",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--aa-primary)";
              e.target.style.boxShadow = "0 0 0 3px var(--aa-primary-soft)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--aa-color-border)";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          display: "grid",
          gap: 12,
        }}
      >
        {filteredProperties.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "var(--aa-color-muted)",
              fontSize: 15,
            }}
          >
            No properties match your search.
          </div>
        ) : (
          filteredProperties.map((prop) => (
            <button
              key={prop.id}
              type="button"
              onClick={() => setSelectedProperty(prop)}
              style={{
                padding: 20,
                borderRadius: "var(--aa-r-card-tight)",
                border: `2px solid ${
                  selectedProperty?.id === prop.id ? "var(--aa-primary)" : "var(--aa-color-border)"
                }`,
                background:
                  selectedProperty?.id === prop.id
                    ? "var(--aa-primary-soft)"
                    : "var(--aa-color-surface)",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 200ms ease",
                boxShadow:
                  selectedProperty?.id === prop.id
                    ? "var(--aa-shadow-card)"
                    : "0 2px 8px rgba(15, 23, 42, 0.04)",
              }}
              onMouseEnter={(e) => {
                if (selectedProperty?.id !== prop.id) {
                  e.currentTarget.style.borderColor = "var(--aa-color-border-strong)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "var(--aa-shadow-card)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedProperty?.id !== prop.id) {
                  e.currentTarget.style.borderColor = "var(--aa-color-border)";
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(15, 23, 42, 0.04)";
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: "var(--aa-font-display)",
                      fontSize: 18,
                      fontWeight: 600,
                      color: "var(--aa-color-ink)",
                      marginBottom: 6,
                    }}
                  >
                    {prop.displayName || "Unnamed Property"}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--aa-color-muted)", marginBottom: 4 }}>
                    Property ID: {prop.id}
                  </div>
                  {prop.account && (
                    <div style={{ fontSize: 13, color: "var(--aa-color-subtle)", marginTop: 4 }}>
                      Account: {prop.account}
                    </div>
                  )}
                </div>
                {selectedProperty?.id === prop.id && (
                  <div
                    style={{
                      fontSize: 24,
                      color: "var(--aa-primary)",
                      fontWeight: 600,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
        <button
          onClick={handleSave}
          disabled={!selectedProperty || saving}
          className={`aa-button ${!selectedProperty || saving ? "aa-button--ghost" : "aa-button--primary"}`}
          style={{
            fontSize: 16,
            padding: "14px 32px",
            cursor: !selectedProperty || saving ? "not-allowed" : "pointer",
            opacity: !selectedProperty || saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : isChatGPTSource ? "Continue to ChatGPT" : "Save Property"}
        </button>
      </div>
    </div>
  );

  return isChatGPTSource ? <ChatgptOnboardingShell>{content}</ChatgptOnboardingShell> : <main className="aa-shell">{content}</main>;
}
