// web/pages/start.js
import { signIn, getSession } from "next-auth/react";
import { useState } from "react";

export async function getServerSideProps(ctx) {
  const session = await getSession({ req: ctx.req });
  return { props: { signedIn: !!session } };
}

async function goCheckout(plan, setLoading) {
  try {
    setLoading(true);
    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }), // "monthly" | "annual"
    });
    const data = await res.json();
    if (data?.url) window.location.href = data.url;
  } finally {
    setLoading(false);
  }
}

export default function StartPage({ signedIn }) {
  const [loading, setLoading] = useState(false);

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>AnalyticsAssistant</h1>
      <p style={{ marginBottom: 24 }}>Connect GA4 and get clear, actionable insights.</p>

      {!signedIn ? (
        <button
          onClick={() => signIn("google")}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            marginBottom: 24,
            cursor: "pointer",
          }}
        >
          Continue with Google
        </button>
      ) : (
        <>
          <p style={{ margin: "16px 0 8px" }}>Upgrade to unlock full reports:</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              disabled={loading}
              onClick={() => goCheckout("monthly", setLoading)}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #ccc",
                cursor: "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              Go Pro — Monthly
            </button>
            <button
              disabled={loading}
              onClick={() => goCheckout("annual", setLoading)}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #ccc",
                cursor: "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              Go Pro — Annual
            </button>
          </div>

          <p style={{ marginTop: 16 }}>
            <a href="/connections">Connect GA4 & choose a property →</a>
          </p>
        </>
      )}
    </main>
  );
}
