// web/pages/dev/query-sanity.js
// Simple, server-only test page to verify /api/ga4/query accepts "propertyId"
// and normalises it to "properties/{id}". Never pre-render this page.

export const config = { runtime: "nodejs" };           // Edge-safe not required; node is fine
export const dynamic = "force-dynamic";                 // Next 13/14 hint to avoid static generation

export async function getServerSideProps() {
  // SSR only; nothing to compute here
  return { props: {} };
}

export default function QuerySanityPage() {
  async function run(kind) {
    const input = document.getElementById("prop").value.trim();
    const body =
      kind === "id"
        ? { propertyId: input, preset: "channels", lastDays: 7 }
        : { property: input, preset: "channels", lastDays: 7 };

    const res = await fetch("/api/ga4/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    try {
      const json = JSON.parse(text);
      document.getElementById("out").textContent = JSON.stringify(json, null, 2);
    } catch {
      document.getElementById("out").textContent = text;
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "ui-sans-serif, system-ui, -apple-system" }}>
      <h1>GA4 Query Sanity (dev)</h1>
      <p>
        This page checks that <code>/api/ga4/query</code> accepts either{" "}
        <code>propertyId</code> or full <code>property</code> and runs without crashing.
      </p>

      <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <input
          id="prop"
          placeholder='e.g. 123456789 or "properties/123456789"'
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => run("id")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}>
            Test with propertyId
          </button>
          <button onClick={() => run("full")} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}>
            Test with property
          </button>
        </div>
        <pre
          id="out"
          style={{
            marginTop: 10,
            background: "#f8f8f8",
            padding: 12,
            borderRadius: 8,
            minHeight: 160,
            overflow: "auto",
          }}
        />
      </div>
    </div>
  );
}
