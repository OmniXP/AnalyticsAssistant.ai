// web/pages/dev/run-ga4-test.js
import { useState } from "react";

export default function RunGa4Test() {
  const [property, setProperty] = useState("");
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadProps() {
    setBusy(true);
    setOut(null);
    try {
      const r = await fetch("/api/ga4/properties");
      const j = await r.json();
      setOut(j);
      // Auto-fill first property if present
      const first = j?.properties?.[0]?.property;
      if (first && !property) setProperty(first);
    } finally {
      setBusy(false);
    }
  }

  async function runReport() {
    if (!property.startsWith("properties/")) {
      alert("Enter a GA4 property id like: properties/123456789");
      return;
    }
    setBusy(true);
    setOut(null);
    try {
      const r = await fetch("/api/ga4/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property,
          dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }],
          dimensions: [{ name: "country" }],
        }),
      });
      const j = await r.json();
      setOut(j);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 8 }}>GA4 Test Runner</h1>
      <p style={{ marginBottom: 16 }}>
        1) Click <b>Load Properties</b> to fetch your GA4 properties (confirms auth).<br/>
        2) Pick or paste a property id (e.g. <code>properties/123456789</code>) and click <b>Run Report</b>.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button disabled={busy} onClick={loadProps}>Load Properties</button>
        <input
          value={property}
          onChange={(e) => setProperty(e.target.value)}
          placeholder="properties/123456789"
          style={{ flex: 1, padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button disabled={busy} onClick={runReport}>Run Report</button>
      </div>

      <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #eee", padding: 12, borderRadius: 8 }}>
        {out ? JSON.stringify(out, null, 2) : (busy ? "Working…" : "No output yet.")}
      </pre>
    </main>
  );
}
