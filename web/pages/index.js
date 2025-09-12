// /workspaces/insightsgpt/web/pages/index.js
import { useState } from "react";

export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const connect = () => {
    window.location.href = "/api/auth/google/start";
  };

  const runReport = async () => {
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ga4/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || JSON.stringify(json));
      setResult(json);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>InsightGPT (MVP)</h1>
      <ol>
        <li>Click <b>Connect Google Analytics</b> and sign in</li>
        <li>Enter your GA4 <b>Property ID</b></li>
        <li>Choose dates and click <b>Run GA4 Report</b></li>
      </ol>

      <button onClick={connect} style={{ padding: 12, cursor: "pointer" }}>
        Connect Google Analytics
      </button>

      <div style={{ marginTop: 24 }}>
        <label>GA4 Property ID:&nbsp;
          <input
            value={propertyId}
            onChange={e => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
          />
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>Start date:&nbsp;
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label style={{ marginLeft: 16 }}>End date:&nbsp;
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={runReport} style={{ padding: 12, cursor: "pointer" }}>
          Run GA4 Report
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 16 }}>Error: {error}</p>}

      {result && (
        <pre style={{ marginTop: 24, background: "#f8f8f8", padding: 16, borderRadius: 8, overflow: "auto" }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
