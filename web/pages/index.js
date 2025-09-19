// /workspaces/insightsgpt/web/pages/index.js
import { useEffect, useMemo, useState } from "react";

/* ================================
   Helpers (shared)
================================== */

const STORAGE_KEY = "insightgpt_preset_v1";

function parseGa4Channels(response) {
  if (!response?.rows?.length) return { rows: [], totals: { sessions: 0, users: 0 } };
  const rows = response.rows.map((r) => ({
    channel: r.dimensionValues?.[0]?.value || "(unknown)",
    sessions: Number(r.metricValues?.[0]?.value || 0),
    users: Number(r.metricValues?.[1]?.value || 0),
  }));
  const totals = rows.reduce(
    (acc, r) => ({ sessions: acc.sessions + r.sessions, users: acc.users + r.users }),
    { sessions: 0, users: 0 }
  );
  rows.sort((a, b) => b.sessions - a.sessions);
  return { rows, totals };
}

function formatPctDelta(curr, prev) {
  if (prev === 0 && curr === 0) return "0%";
  if (prev === 0) return "+100%";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computePreviousRange(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const oneDay = 24 * 60 * 60 * 1000;
  const days = Math.round((end - start) / oneDay) + 1; // inclusive
  const prevEnd = new Date(start.getTime() - oneDay);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * oneDay);
  return { prevStart: ymd(prevStart), prevEnd: ymd(prevEnd) };
}

/* CSV: Channels */
function downloadCsvChannels(rows, totals, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Channel", "Sessions", "Users", "% of Sessions"];
  const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
  const lines = rows.map((r) => {
    const pct = totalSessions ? Math.round((r.sessions / totalSessions) * 100) : 0;
    return [r.channel, r.sessions, r.users, `${pct}%`];
  });
  lines.push(["Total", totals.sessions, totals.users, ""]);
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const filename = `ga4_channels_${startDate}_to_${endDate}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* CSV: Products */
function downloadCsvProducts(rows, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Item", "ID", "Items Viewed", "Add-to-Carts", "Items Purchased", "Item Revenue"];
  const lines = rows.map((r) => [
    r.name, r.id,
    r.itemsViewed, r.itemsAddedToCart, r.itemsPurchased,
    r.itemRevenue
  ]);
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const filename = `ga4_products_${startDate}_to_${endDate}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* Simple chart (QuickChart) for channels */
function buildChannelPieUrl(rows) {
  if (!rows?.length) return "";
  const labels = rows.map((r) => r.channel);
  const data = rows.map((r) => r.sessions);
  const cfg = {
    type: "pie",
    data: { labels, datasets: [{ data }] },
    options: { plugins: { legend: { position: "bottom" } } },
  };
  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return `https://quickchart.io/chart?w=550&h=360&c=${encoded}`;
}

/* Reusable AI block (summary + copy) */
function AiBlock({ endpoint, payload, disabled }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (disabled) return;
    setLoading(true); setError(""); setText(""); setCopied(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) ||
          (data && typeof data === "object" ? JSON.stringify(data) : "") ||
          raw || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const summary = (data && data.summary) || raw || "No response";
      setText(summary);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={run} disabled={loading || disabled} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {loading ? "Summarising…" : "Summarise with AI"}
        </button>
        <button onClick={copy} disabled={!text} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {copied ? "Copied!" : "Copy insight"}
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 8, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {text && (
        <div style={{ marginTop: 10, background: "#fffceb", border: "1px solid #f5e08f", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap" }}>
          {text}
        </div>
      )}
    </>
  );
}

/* ================================
   Page
================================== */

export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Presets
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      if (saved?.startDate) setStartDate(saved.startDate);
      if (saved?.endDate) setEndDate(saved.endDate);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ propertyId, startDate, endDate }));
    } catch {}
  }, [propertyId, startDate, endDate]);

  const { rows, totals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(
    () => parseGa4Channels(prevResult),
    [prevResult]
  );

  const top = rows[0];
  const topShare = top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

  const connect = () => { window.location.href = "/api/auth/google/start"; };

  async function fetchGa4({ propertyId, startDate, endDate }) {
    const res = await fetch("/api/ga4/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, startDate, endDate }),
    });
    const txt = await res.text();
    let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
    if (!res.ok) {
      throw new Error((json && (json.error || json.message)) || txt || `HTTP ${res.status}`);
    }
    return json;
  }

  const runReport = async () => {
    setError(""); setResult(null); setPrevResult(null); setLoading(true);
    try {
      const curr = await fetchGa4({ propertyId, startDate, endDate });
      setResult(curr);
      if (comparePrev) {
        const { prevStart, prevEnd } = computePreviousRange(startDate, endDate);
        const prev = await fetchGa4({ propertyId, startDate: prevStart, endDate: prevEnd });
        setPrevResult(prev);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPreset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPropertyId("");
    setStartDate("2024-09-01");
    setEndDate("2024-09-30");
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>Connect GA4, choose a date range, and view key ecommerce insights.</p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>Connect Google Analytics</button>
        <label>GA4 Property ID&nbsp;
          <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="e.g. 123456789" style={{ padding: 8, minWidth: 180 }} />
        </label>
        <label>Start date&nbsp;
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: 8 }} />
        </label>
        <label>End date&nbsp;
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: 8 }} />
        </label>
        <button onClick={runReport} style={{ padding: "10px 14px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Running…" : "Run GA4 Report"}
        </button>
        <button onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)} style={{ padding: "10px 14px", cursor: "pointer" }} disabled={!rows.length}>
          Download CSV
        </button>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8, borderLeft: "1px solid #ddd" }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          Compare vs previous period
        </label>
        <button onClick={resetPreset} style={{ padding: "8px 12px", cursor: "pointer", marginLeft: "auto" }}>Reset preset</button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 16 }}>Error: {error}</p>}

      {/* At a glance */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24, background: "#f6f7f8", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>At a glance</h2>
          <ul>
            <li><b>Total sessions:</b> {totals.sessions.toLocaleString()}</li>
            <li><b>Total users:</b> {totals.users.toLocaleString()}</li>
            {top && (
              <li><b>Top channel:</b> {top.channel} with {top.sessions.toLocaleString()} sessions ({topShare}% of total)</li>
            )}
            {prevRows.length > 0 && (
              <>
                <li style={{ marginTop: 6 }}>
                  <b>Sessions vs previous:</b> {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev {prevTotals.sessions.toLocaleString()})
                </li>
                <li><b>Users vs previous:</b> {formatPctDelta(totals.users, prevTotals.users)} (prev {prevTotals.users.toLocaleString()})</li>
              </>
            )}
          </ul>
        </section>
      )}

      {/* Channels table + chart */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Traffic by Default Channel Group</h3>
            <AiBlock
              endpoint="/api/insights/summarise"
              payload={{ rows, totals, dateRange: { start: startDate, end: endDate } }}
              disabled={false}
            />
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Channel</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>% of Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                  return (
                    <tr key={r.channel}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.channel}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " +
                        "#eee" }}>{r.users.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16 }}>
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>
        </section>
      )}

      {/* Raw JSON (debug) */}
      {result && (
        <details style={{ marginTop: 24 }}>
          <summary>Raw GA4 JSON (debug)</summary>
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 16, borderRadius: 8, overflow: "auto" }}>
{JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}

      {/* Top Pages */}
      <TopPages propertyId={propertyId} startDate={startDate} endDate={endDate} />

      {/* Source / Medium */}
      <SourceMedium propertyId={propertyId} startDate={startDate} endDate={endDate} />

      {/* E-commerce KPIs */}
      <EcommerceKPIs propertyId={propertyId} startDate={startDate} endDate={endDate} />

      {/* Product performance */}
      <Products propertyId={propertyId} startDate={startDate} endDate={endDate} />

      {/* Checkout funnel */}
      <CheckoutFunnel propertyId={propertyId} startDate={startDate} endDate={endDate} />
    </main>
  );
}

/* ================================
   Sections (components)
================================== */

/* Top Pages */
function TopPages({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch("/api/ga4/top-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 10 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) ||
          (data && typeof data === "object" ? JSON.stringify(data) : "") ||
          txt || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const parsed = (data.rows || []).map((r) => ({
        title: r.dimensionValues?.[0]?.value || "(untitled)",
        path: r.dimensionValues?.[1]?.value || "",
        views: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
      }));
      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Top pages (views)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load Top Pages"}
          </button>
          <AiBlock
            endpoint="/api/insights/summarise-pages"
            payload={{ rows, dateRange: { start: startDate, end: endDate } }}
            disabled={!rows.length}
          />
        </div>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {rows.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Page Title</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Path</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Views</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.path}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.title}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.path}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.views.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && !loading && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

/* Source / Medium */
function SourceMedium({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch("/api/ga4/source-medium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 25 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) ||
          (data && typeof data === "object" ? JSON.stringify(data) : "") ||
          txt || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const parsed = (data.rows || []).map((r, i) => ({
        source: r.dimensionValues?.[0]?.value || "(unknown)",
        medium: r.dimensionValues?.[1]?.value || "(unknown)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        conversions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
        idx: i,
      }));
      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load Source/Medium"}
          </button>
          <AiBlock
            endpoint="/api/insights/summarise-source-medium"
            payload={{ rows, dateRange: { start: startDate, end: endDate } }}
            disabled={!rows.length}
          />
        </div>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {rows.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source / Medium</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Conversions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.source}/${r.medium}/${r.idx}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    <span style={{ fontFamily: "monospace" }}>{r.source}</span>&nbsp;/&nbsp;
                    <span style={{ fontFamily: "monospace" }}>{r.medium}</span>
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.conversions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    £{r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && !loading && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

/* E-commerce KPIs */
function EcommerceKPIs({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true); setError(""); setTotals(null);
    try {
      const res = await fetch("/api/ga4/ecommerce-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) ||
          (data && typeof data === "object" ? JSON.stringify(data) : "") ||
          txt || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setTotals(data?.totals || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const runAi = async () => {
    setAiLoading(true); setAiError(""); setAiText(""); setCopied(false);
    try {
      const res = await fetch("/api/insights/summarise-ecom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totals, dateRange: { start: startDate, end: endDate } }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) {
        const msg =
          (data && (data.error || data.message)) ||
          (data && typeof data === "object" ? JSON.stringify(data) : "") ||
          txt || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setAiText((data && data.summary) || txt || "No response");
    } catch (e) {
      setAiError(String(e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(aiText || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setAiError("Could not copy to clipboard"); }
  };

  const currency = "£";
  const fmtMoney = (v) => `${currency}${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (v) => `${Number(v || 0).toFixed(2)}%`;

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load E-commerce KPIs"}
          </button>
          <button onClick={runAi} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!totals || aiLoading}>
            {aiLoading ? "Summarising…" : "Summarise with AI"}
          </button>
          <button onClick={copy} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!aiText}>
            {copied ? "Copied!" : "Copy insight"}
          </button>
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Metric</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Revenue</td><td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{fmtMoney(totals.revenue)}</td></tr>
              <tr><td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Transactions</td><td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(totals.transactions || 0).toLocaleString()}</td></tr>
              <tr><td style={{ padding: 8, borderBottom: "1px solid #eee" }}>AOV</td><td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{fmtMoney(totals.aov)}</td></tr>
              <tr><td style={{ padding: 8, borderBottom: "1px solid #eee" }}>CTR</td><td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{fmtPct(totals.ctr)}</td></tr>
              <tr><td style={{ padding: 8, borderBottom: "1px solid #eee" }}>CVR</td><td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{fmtPct(totals.cvr)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {aiError && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {aiError}</p>}
      {aiText && (
        <div style={{ marginTop: 10, background: "#fffceb", border: "1px solid #f5e08f", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap" }}>
          {aiText}
        </div>
      )}
      {!totals && !loading && !error && (
        <p style={{ marginTop: 8, color: "#666" }}>No KPIs loaded yet.</p>
      )}
    </section>
  );
}

/** ---------- small helper: inline AI summary (button + copy) ---------- */
function AiInline({ endpoint, payload, disabled }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setLoading(true);
    setError("");
    setText("");
    setCopied(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });

      // Read text first; try JSON; fall back to raw
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}

      if (!res.ok) {
        const msg = data?.error
          ? `${data.error}${data.details ? ` — ${typeof data.details === "string" ? data.details : JSON.stringify(data.details)}` : ""}`
          : raw || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const summary = (data && (data.summary || data.text)) || raw || "No response";
      setText(summary);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={run}
        style={{ padding: "8px 12px", cursor: disabled ? "not-allowed" : "pointer" }}
        disabled={disabled || loading}
        title={disabled ? "Load data first" : "Generate quick AI insight"}
      >
        {loading ? "Summarising…" : "Summarise with AI"}
      </button>
      <button
        onClick={copy}
        style={{ padding: "8px 12px", cursor: text ? "pointer" : "not-allowed" }}
        disabled={!text}
        title={text ? "Copy the AI insight" : "Summarise first"}
      >
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: "crimson", marginLeft: 6, whiteSpace: "pre-wrap" }}>Error: {error}</span>}
      {text && (
        <span
          style={{
            marginLeft: 6,
            background: "#fffceb",
            border: "1px solid #f5e08f",
            padding: "6px 8px",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            maxWidth: 700,
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

/* Product performance */
function Products({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [usedDim, setUsedDim] = useState(""); // itemName or itemId
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = async () => {
    setLoading(true); setError(""); setRows([]); setNote(""); setHasLoaded(true); setUsedDim("");
    try {
      const res = await fetch("/api/ga4/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 50 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}

      if (!res.ok) {
        const serverMsg = data?.error
          ? `${data.error}${data.details ? ` — ${JSON.stringify(data.details)}` : ""}`
          : txt || `HTTP ${res.status}`;
        throw new Error(serverMsg);
      }

      setUsedDim(data?.usedDimension || "");
      setNote(data?.note || "");
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const hasRows = rows.length > 0;

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Product performance</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Products"}
        </button>
        <button
          onClick={() => downloadCsvProducts(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!hasRows}
          title={hasRows ? "Download table as CSV" : "Load products first"}
        >
          Download CSV
        </button>
        <AiInline
          endpoint="/api/insights/summarise-products"
          disabled={!hasRows}
          payload={{ rows, dateRange: { start: startDate, end: endDate } }}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {note && !hasRows && <p style={{ marginTop: 8, color: "#666", whiteSpace: "pre-wrap" }}>{note}</p>}
      {!hasRows && !error && hasLoaded && !note && (
        <p style={{ marginTop: 8, color: "#666" }}>No product rows returned for this date range.</p>
      )}

      {hasRows && (
        <>
          {usedDim && (
            <p style={{ marginTop: 8, color: "#666" }}>
              Using <code>{usedDim}</code> as product dimension.
            </p>
          )}

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Item</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>ID</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid " + "#ddd", padding: 8 }}>Views</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid " + "#ddd", padding: 8 }}>Add-to-Carts</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid " + "#ddd", padding: 8 }}>Items Purchased</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid " + "#ddd", padding: 8 }}>Item Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.id || r.name}-${i}`}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.id}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.itemsViewed.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.itemsAddedToCart.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.itemsPurchased.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                      {r.itemRevenue.toLocaleString(undefined, { style: "currency", currency: "GBP" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** ---------- small helper: inline AI summary (button + copy) ---------- */
function AiInline({ endpoint, payload, disabled }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setLoading(true);
    setError("");
    setText("");
    setCopied(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      });

      // Read text first; try JSON; fall back to raw
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}

      if (!res.ok) {
        const msg = data?.error
          ? `${data.error}${data.details ? ` — ${typeof data.details === "string" ? data.details : JSON.stringify(data.details)}` : ""}`
          : raw || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const summary = (data && (data.summary || data.text)) || raw || "No response";
      setText(summary);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={run}
        style={{ padding: "8px 12px", cursor: disabled ? "not-allowed" : "pointer" }}
        disabled={disabled || loading}
        title={disabled ? "Load data first" : "Generate quick AI insight"}
      >
        {loading ? "Summarising…" : "Summarise with AI"}
      </button>
      <button
        onClick={copy}
        style={{ padding: "8px 12px", cursor: text ? "pointer" : "not-allowed" }}
        disabled={!text}
        title={text ? "Copy the AI insight" : "Summarise first"}
      >
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: "crimson", marginLeft: 6, whiteSpace: "pre-wrap" }}>Error: {error}</span>}
      {text && (
        <span
          style={{
            marginLeft: 6,
            background: "#fffceb",
            border: "1px solid #f5e08f",
            padding: "6px 8px",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            maxWidth: 700,
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

/* Checkout funnel */
function CheckoutFunnel({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = async () => {
    setLoading(true); setError(""); setRows([]); setNote(""); setHasLoaded(true);
    try {
      const res = await fetch("/api/ga4/checkout-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}

      if (!res.ok) {
        const serverMsg = data?.error
          ? `${data.error}${data.details ? ` — ${JSON.stringify(data.details)}` : ""}`
          : txt || `HTTP ${res.status}`;
        throw new Error(serverMsg);
      }

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setNote(data?.note || "");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const hasRows = rows.length > 0;

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checkout funnel</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Checkout"}
        </button>
        <AiInline
          endpoint="/api/insights/summarise-checkout"
          disabled={!hasRows}
          payload={{ rows, dateRange: { start: startDate, end: endDate } }}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {note && !hasRows && <p style={{ marginTop: 8, color: "#666", whiteSpace: "pre-wrap" }}>{note}</p>}
      {!hasRows && !error && hasLoaded && !note && (
        <p style={{ marginTop: 8, color: "#666" }}>No rows for the selected date range.</p>
      )}

      {hasRows && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Step</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.step}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.step}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
