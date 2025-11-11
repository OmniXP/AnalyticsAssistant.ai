// web/pages/dev/ga4-smoketest.js
import { useEffect, useState } from "react";

function Box({ title, children }) {
  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{title}</h2>
      {children}
    </div>
  );
}

export default function Ga4SmokeTest() {
  const [status, setStatus] = useState({ loading: true, hasTokens: false, expired: true });
  const [propsState, setPropsState] = useState({ loading: true, email: null, properties: [], error: null });
  const [selectedProp, setSelectedProp] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [reportError, setReportError] = useState(null);

  // 1) Check auth status from the server
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/google/status", { cache: "no-store" });
        const j = await r.json();
        setStatus({ loading: false, hasTokens: !!j.hasTokens, expired: !!j.expired });
      } catch (e) {
        setStatus({ loading: false, hasTokens: false, expired: true });
      }
    })();
  }, []);

  // 2) Fetch properties if tokens exist and are not expired
  useEffect(() => {
    if (!status.loading && status.hasTokens && !status.expired) {
      (async () => {
        setPropsState((s) => ({ ...s, loading: true, error: null }));
        try {
          const r = await fetch("/api/ga4/properties", { cache: "no-store" });
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || "Failed to list properties");
          setPropsState({ loading: false, email: j.email || null, properties: j.properties || [], error: null });
          if ((j.properties || []).length > 0) {
            setSelectedProp(j.properties[0].id);
          }
        } catch (e) {
          setPropsState({ loading: false, email: null, properties: [], error: e.message || String(e) });
        }
      })();
    }
  }, [status.loading, status.hasTokens, status.expired]);

  async function runTestReport() {
    setReportLoading(true);
    setReportError(null);
    setReportResult(null);
    try {
      if (!selectedProp) throw new Error("No GA4 property selected");

      // Last 7 full days
      const end = new Date();
      end.setDate(end.getDate() - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);

      const fmt = (d) => d.toISOString().slice(0, 10);

      const body = {
        propertyId: String(selectedProp), // server normalises to "properties/{id}"
        dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
        metrics: [{ name: "sessions" }],
        dimensions: [{ name: "date" }],
        limit: 10,
      };

      const r = await fetch("/api/ga4/query-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Report failed");

      setReportResult(j);
    } catch (e) {
      setReportError(e.message || String(e));
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <h1>GA4 Smoke Test</h1>

      <Box title="Google connection">
        {status.loading ? (
          <p>Checking…</p>
        ) : status.hasTokens && !status.expired ? (
          <p style={{ color: "#137333", fontWeight: 600 }}>Connected to Google Analytics</p>
        ) : status.hasTokens && status.expired ? (
          <p style={{ color: "#b80606", fontWeight: 600 }}>
            Token expired. Click ‘Connect Google Analytics’ on your main page to re-authorise.
          </p>
        ) : (
          <p style={{ color: "#b80606", fontWeight: 600 }}>
            Not connected. Click ‘Connect Google Analytics’ on your main page.
          </p>
        )}
        <div style={{ fontSize: 12, color: "#666" }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(status, null, 2)}</pre>
        </div>
      </Box>

      <Box title="GA4 properties">
        {propsState.loading ? (
          <p>Loading properties…</p>
        ) : propsState.error ? (
          <p style={{ color: "#b80606" }}>Error: {propsState.error}</p>
        ) : propsState.properties.length === 0 ? (
          <p>No GA4 properties found for this Google account.</p>
        ) : (
          <>
            <p>
              Signed in as: <strong>{propsState.email || "unknown"}</strong>
            </p>
            <label>
              Choose property:&nbsp;
              <select value={selectedProp} onChange={(e) => setSelectedProp(e.target.value)}>
                {propsState.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} (id: {p.id})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(propsState, null, 2)}</pre>
        </div>
      </Box>

      <Box title="Run test report (sessions by date, last 7 days)">
        <button
          onClick={runTestReport}
          disabled={reportLoading || !selectedProp}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc" }}
        >
          {reportLoading ? "Running…" : "Run report"}
        </button>
        {reportError && <p style={{ color: "#b80606" }}>Error: {reportError}</p>}
        {reportResult && (
          <div style={{ marginTop: 12 }}>
            <p>Raw response:</p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
              {JSON.stringify(reportResult, null, 2)}
            </pre>
          </div>
        )}
      </Box>
    </div>
  );
}
