/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";

/** ---------- helpers ---------- */
const STORAGE_KEY = "insightgpt_preset_v1";

function parseGa4(response) {
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

/** CSV export */
function downloadCsv(rows, totals, startDate, endDate) {
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
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** QuickChart pie chart URL */
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

/** Currency helper */
function formatCurrency(value, currencyCode = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currencyCode }).format(value || 0);
  } catch {
    return `£${(value || 0).toFixed(2)}`;
  }
}

/** ---------- page ---------- */
export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Load preset once on first load
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      if (saved?.startDate) setStartDate(saved.startDate);
      if (saved?.endDate) setEndDate(saved.endDate);
    } catch {}
  }, []);

  // Save preset whenever these change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ propertyId, startDate, endDate })
      );
    } catch {}
  }, [propertyId, startDate, endDate]);

  const { rows, totals } = useMemo(() => parseGa4(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(
    () => parseGa4(prevResult),
    [prevResult]
  );

  const top = rows[0];
  const topShare = top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

  const connect = () => {
    window.location.href = "/api/auth/google/start";
  };

  async function fetchGa4({ propertyId, startDate, endDate }) {
    const res = await fetch("/api/ga4/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, startDate, endDate }),
    });
    const txt = await res.text();
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch {}
    if (!res.ok) {
      throw new Error((json && (json.error || json.message)) || txt || `HTTP ${res.status}`);
    }
    return json;
  }

  const runReport = async () => {
    setError("");
    setResult(null);
    setPrevResult(null);
    setLoading(true);
    try {
      // Current period
      const curr = await fetchGa4({ propertyId, startDate, endDate });
      setResult(curr);

      // Previous period (optional)
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
      <p style={{ marginTop: 0, color: "#555" }}>Connect GA4, choose a date range, and view traffic by channel.</p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Connect Google Analytics
        </button>

        <label>GA4 Property ID&nbsp;
          <input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            style={{ padding: 8, minWidth: 180 }}
          />
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

        <button
          onClick={() => downloadCsv(rows, totals, startDate, endDate)}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Run a report first"}
        >
          Download CSV
        </button>

        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8, borderLeft: "1px solid #ddd" }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          Compare vs previous period
        </label>

        <button onClick={resetPreset} style={{ padding: "8px 12px", cursor: "pointer", marginLeft: "auto" }}>
          Reset preset
        </button>
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
              <li>
                <b>Top channel:</b> {top.channel} with {top.sessions.toLocaleString()} sessions ({topShare}% of total)
              </li>
            )}
            {/* Compare vs previous */}
            {prevRows.length > 0 && (
              <>
                <li style={{ marginTop: 6 }}>
                  <b>Sessions vs previous:</b>{" "}
                  {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev {prevTotals.sessions.toLocaleString()})
                </li>
                <li>
                  <b>Users vs previous:</b>{" "}
                  {formatPctDelta(totals.users, prevTotals.users)} (prev {prevTotals.users.toLocaleString()})
                </li>
              </>
            )}
          </ul>
        </section>
      )}

      {/* Channel table */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Traffic by Default Channel Group</h3>
          <div style={{ overflowX: "auto" }}>
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
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: 8, borderTop: "2px solid #ccc" }}><b>Total</b></td>
                  <td style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }}><b>{totals.sessions.toLocaleString()}</b></td>
                  <td style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }}><b>{totals.users.toLocaleString()}</b></td>
                  <td style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Channel share chart (QuickChart) */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Channel share (sessions)</h3>
          <img
            src={buildChannelPieUrl(rows)}
            alt="Channel share chart"
            style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
          />
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

      {/* AI summary (channels) */}
      {rows.length > 0 && (
        <AiSummary rows={rows} totals={totals} startDate={startDate} endDate={endDate} />
      )}

      {/* Top pages */}
      {propertyId && (
        <TopPages propertyId={propertyId} startDate={startDate} endDate={endDate} />
      )}

      {/* Source / Medium */}
      {propertyId && (
        <SourceMedium propertyId={propertyId} startDate={startDate} endDate={endDate} />
      )}

      {/* E-commerce KPIs */}
      {propertyId && (
        <EcommerceKPIs propertyId={propertyId} startDate={startDate} endDate={endDate} />
      )}
    </main>
  );
}

/** ---------- components ---------- */
function AiSummary({ rows, totals, startDate, endDate }) {
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
      const res = await fetch("/api/insights/summarise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          totals,
          dateRange: { start: startDate, end: endDate },
        }),
      });

      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}

      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || raw || `HTTP ${res.status}`);
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
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={run} style={{ padding: "10px 14px", cursor: "pointer" }} disabled={loading}>
          {loading ? "Summarising…" : "Summarise with AI"}
        </button>
        <button
          onClick={copy}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={!text}
          title={text ? "Copy the summary to clipboard" : "Run summary first"}
        >
          {copied ? "Copied!" : "Copy insight"}
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {text && (
        <div
          style={{
            marginTop: 12,
            background: "#fffceb",
            border: "1px solid #f5e08f",
            padding: 12,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          {text}
        </div>
      )}
    </section>
  );
}

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
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Top pages (views)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Top Pages"}
        </button>
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
    </section>
  );
}

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
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 25, includeCampaign: true }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r) => ({
        source: r.dimensionValues?.[0]?.value || "(unknown)",
        medium: r.dimensionValues?.[1]?.value || "(unknown)",
        campaignId: r.dimensionValues?.[2]?.value || "",
        campaignName: r.dimensionValues?.[3]?.value || "",
        sessions: Number(r.metricValues?.[0]?.value || 0),
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Source / Medium (sessions)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source/Medium"}
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {rows.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Campaign</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}/${r.medium}/${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {r.campaignName || (r.campaignId ? `ID: ${r.campaignId}` : "—")}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Ecommerce KPIs (component) ----------
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
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);
      setTotals(data?.totals || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Derived KPIs
  const purchases = totals?.purchases || 0;
  const revenue = totals?.purchaseRevenue || 0;
  const sessions = totals?.sessions || 0;
  const users = totals?.activeUsers || 0; // GA4 best practice for CVR denominator
  const clicks = totals?.adClicks || 0;
  const imps = totals?.adImpressions || 0;
  const currency = totals?.currencyCode || "GBP";

  const aov = purchases > 0 ? revenue / purchases : 0;         // Average Order Value
  const cvr = users > 0 ? (purchases / users) * 100 : 0;       // Conversion Rate
  const ctr = imps > 0 ? (clicks / imps) * 100 : null;         // CTR (if ads data present)

  const summarise = async () => {
    setAiLoading(true); setAiText(""); setAiError(""); setCopied(false);
    try {
      if (!totals) throw new Error("Load the e-commerce KPIs first.");
      const res = await fetch("/api/insights/summarise-ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totals: { purchases, revenue, sessions, users, clicks, imps, currency, aov, cvr, ctr },
          dateRange: { start: startDate, end: endDate },
        }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);
      setAiText((data && data.summary) || txt || "No response");
    } catch (e) {
      setAiError(String(e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(aiText || ""); setCopied(true); setTimeout(()=>setCopied(false), 1500); }
    catch { setAiError("Could not copy to clipboard"); }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
        <button onClick={summarise} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={aiLoading || !totals}>
          {aiLoading ? "Summarising…" : "Summarise with AI"}
        </button>
        <button onClick={copy} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!aiText}>
          {copied ? "Copied!" : "Copy insight"}
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <KpiCard label="Revenue" value={formatCurrency(revenue, currency)} />
          <KpiCard label="Purchases" value={purchases.toLocaleString()} />
          <KpiCard label="AOV" value={formatCurrency(aov, currency)} tooltip="Average Order Value = Revenue / Purchases" />
          <KpiCard label="CVR" value={`${cvr.toFixed(2)}%`} tooltip="Conversion Rate = Purchases / Active Users" />
          <KpiCard label="Sessions" value={sessions.toLocaleString()} />
          <KpiCard label="Active Users" value={users.toLocaleString()} />
          {ctr !== null && <KpiCard label="CTR" value={`${ctr.toFixed(2)}%`} tooltip="CTR = Ad Clicks / Impressions (ads-linked data)" />}
        </div>
      )}

      {aiError && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {aiError}</p>}
      {aiText && (
        <div style={{ marginTop: 12, background: "#fffceb", border: "1px solid #f5e08f", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap" }}>
          {aiText}
        </div>
      )}
    </section>
  );
}

function KpiCard({ label, value, tooltip }) {
  return (
    <div title={tooltip || ""} style={{ background: "#f6f7f8", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
