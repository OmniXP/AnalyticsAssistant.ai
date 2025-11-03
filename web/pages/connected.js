// web/pages/connections.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../lib/authOptions";

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) return { redirect: { destination: "/start", permanent: false } };
  return { props: {} };
}

export default function Connections() {
  async function connectGA4() {
    window.location.href = "/api/auth/google/start";
  }

  async function pickGA4() {
    const s = await (await fetch("/api/auth/google/status")).json();
    if (!s.connected) {
      alert("Not connected. Click Connect GA4 first.");
      return;
    }
    const data = await (await fetch("/api/ga4/properties")).json();
    const list = (data.properties || []).slice(0, 100);
    if (!list.length) return alert("No GA4 properties found on this account");

    const pick = prompt(
      "Choose a property number:\n\n" +
        list.map((x, i) => `${i + 1}. ${x.propertyDisplayName} (${x.property})`).join("\n")
    );
    const idx = parseInt(pick, 10) - 1;
    const chosen = list[idx];
    if (!chosen) return alert("Invalid selection");

    const r = await fetch("/api/ga4/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyId: chosen.property,
        propertyName: `${chosen.accountDisplayName} – ${chosen.propertyDisplayName}`,
      }),
    });
    if (!r.ok) return alert("Failed to save selection");
    alert("Saved. You can now view insights.");
  }

  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Connections</h1>
      <p style={{ marginBottom: 16 }}>Connect Google Analytics 4 and choose a property.</p>
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={connectGA4} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc" }}>
          Connect GA4
        </button>
        <button onClick={pickGA4} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc" }}>
          Pick GA4 Property
        </button>
      </div>
      <p style={{ marginTop: 16, color: "#666" }}>MVP picker — we’ll pretty this up later.</p>
    </main>
  );
}
