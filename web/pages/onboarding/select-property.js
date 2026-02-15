// web/pages/onboarding/select-property.js
// Property selection page for ChatGPT onboarding flow

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";

const CHATGPT_GPT_URL = process.env.NEXT_PUBLIC_CHATGPT_GPT_URL || "https://chat.openai.com";
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

  if (checkingConnection) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-600">Checking GA4 connection...</p>
      </main>
    );
  }

  if (!ga4Connected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-yellow-600 text-4xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold mb-2">GA4 Not Connected</h1>
        <p className="text-gray-600 mb-4">
          Please connect your Google Analytics 4 account first before selecting a property.
        </p>
        <a
          href={`/onboard?source=chatgpt${router.query.next ? `&next=${encodeURIComponent(router.query.next)}` : ""}`}
          className="mt-4 inline-flex items-center px-6 py-3 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:opacity-90 transition"
        >
          Connect GA4
        </a>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-green-600 text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Property Selected</h1>
        <p className="text-gray-600 mb-4">
          {propertyName
            ? `Default GA4 property set to: ${propertyName}`
            : "Your default GA4 property has been saved."}
        </p>
        {isChatGPTSource && (
          <a
            href={CHATGPT_GPT_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center px-6 py-3 rounded-lg bg-black text-white text-sm font-medium hover:opacity-90 transition"
          >
            Return to ChatGPT
          </a>
        )}
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-600">Loading GA4 properties...</p>
      </main>
    );
  }

  if (error && !properties.length) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-red-600 text-4xl mb-4">❌</div>
        <h1 className="text-2xl font-bold mb-2">Error Loading Properties</h1>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadProperties}
          className="mt-4 inline-flex items-center px-6 py-3 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:opacity-90 transition"
        >
          Retry
        </button>
      </main>
    );
  }

  if (properties.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4 max-w-2xl mx-auto">
        <div className="text-yellow-600 text-4xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold mb-2">No GA4 Properties Found</h1>
        <p className="text-gray-600 mb-4">
          Your Google account doesn't have access to any GA4 properties yet. Please create or request access to a GA4 property in Google Analytics first.
        </p>
        <a
          href="https://analytics.google.com"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center px-6 py-3 rounded-lg bg-[#4285F4] text-white text-sm font-medium hover:opacity-90 transition"
        >
          Open Google Analytics
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 text-center">
        {isChatGPTSource ? "Select Your Default GA4 Property" : "Select GA4 Property"}
      </h1>
      <p className="text-gray-600 mb-8 text-center max-w-2xl">
        {isChatGPTSource
          ? "Choose the GA4 property you want to use as your default for ChatGPT actions. This property will be used for all reports unless you specify a different one."
          : "Choose the GA4 property you want to use as your default."}
      </p>

      {propertyLimitError && (
        <div className="w-full mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-800 font-medium mb-2">{propertyLimitError.message}</p>
          <p className="text-yellow-700 text-sm mb-3">
            {propertyLimitError.limit?.plan === "free"
              ? "Free plan supports 1 GA4 property. Upgrade to Premium to connect up to 5 properties."
              : "Premium plan supports up to 5 GA4 properties. Remove one before adding another."}
          </p>
          <a
            href={PREMIUM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm font-medium hover:opacity-90 transition"
          >
            Upgrade to Premium
          </a>
        </div>
      )}

      {error && !propertyLimitError && (
        <div className="w-full mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {properties.length > 1 && (
        <div className="w-full mb-6">
          <input
            type="text"
            placeholder="Search properties by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="w-full grid gap-4 mb-8">
        {filteredProperties.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No properties match your search.</div>
        ) : (
          filteredProperties.map((prop) => (
            <button
              key={prop.id}
              type="button"
              onClick={() => setSelectedProperty(prop)}
              className={`p-4 border-2 rounded-lg text-left transition-all ${
                selectedProperty?.id === prop.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-lg mb-1">{prop.displayName || "Unnamed Property"}</div>
                  <div className="text-sm text-gray-600">Property ID: {prop.id}</div>
                  {prop.account && (
                    <div className="text-xs text-gray-500 mt-1">Account: {prop.account}</div>
                  )}
                </div>
                {selectedProperty?.id === prop.id && (
                  <div className="text-blue-500 text-2xl">✓</div>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="w-full flex justify-center">
        <button
          onClick={handleSave}
          disabled={!selectedProperty || saving}
          className={`px-8 py-3 rounded-lg text-white text-sm font-medium transition ${
            !selectedProperty || saving
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-black hover:opacity-90"
          }`}
        >
          {saving ? "Saving..." : isChatGPTSource ? "Continue to ChatGPT" : "Save Property"}
        </button>
      </div>
    </main>
  );
}
