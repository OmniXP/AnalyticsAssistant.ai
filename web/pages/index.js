import { useEffect, useMemo, useState } from "react";

/* ===========================
   Helpers
   =========================== */
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
  const pct = Math.round(((curr - prev) / Math.max(prev, 1)) * 100);
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

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function currency(amount, currencyCode = "GBP") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(
      Number(amount || 0)
    );
  } catch {
    return String(amount || 0);
  }
}

/* ---------- CSV (channels) ---------- */
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

/* ---------- QuickChart pie chart ---------- */
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

/* ===========================
   Re-usable AI block (inline buttons near titles)
   =========================== */
function AiBlock({ endpoint, payload, disabled }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setLoading(true);
    setText("");
    setError("");
    setCopied(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || raw || `HTTP ${res.status}`);
      setText((data && data.summary) || raw || "No response");
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
      {/* inline CTA row: put this inside the section header row */}
      <div style={{ display: "inline-flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
        <button onClick={run} disabled={disabled || loading} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {loading ? "Summarising…" : "Summarise with AI"}
        </button>
        <button onClick={copy} disabled={!text} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {copied ? "Copied!" : "Copy insight"}
        </button>
      </div>

      {/* output area (below the section content) */}
      {(error || text) && (
        <div
          style={{
            marginTop: 8,
            background: error ? "#ffecec" : "#fffceb",
            border: `1px solid ${error ? "#f5b5b5" : "#f5e08f"}`,
            padding: 12,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          {error ? `Error: ${error}` : text}
        </div>
      )}
    </>
  );
}

/* ===========================
   Page
   =========================== */
export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const { rows, totals } = useMemo(() => parseGa4(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(() => parseGa4(prevResult), [prevResult]);

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
    if (!res.ok) throw new Error((json && (json.error || json.message)) || txt || `HTTP ${res.status}`);
    return json;
  }

  const runReport = async () => {
    setError("");
    setResult(null);
    setPrevResult(null);
    setLoading(true);
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
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>Connect GA4, choose a date range, and view insights.</p>

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
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          Compare vs previous
        </label>
        <button onClick={runReport} style={{ padding: "10px 14px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Running…" : "Run GA4 Report"}
        </button>
        <button onClick={() => downloadCsv(rows, totals, startDate, endDate)} style={{ padding: "10px 14px", cursor: "pointer" }} disabled={!rows.length}>
          Download CSV
        </button>
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
              <li>
                <b>Top channel:</b> {top.channel} with {top.sessions.toLocaleString()} sessions ({topShare}% of total)
              </li>
            )}
            {prevRows.length > 0 && (
              <>
                <li style={{ marginTop: 6 }}>
                  <b>Sessions vs previous:</b> {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev {prevTotals.sessions.toLocaleString()})
                </li>
                <li>
                  <b>Users vs previous:</b> {formatPctDelta(totals.users, prevTotals.users)} (prev {prevTotals.users.toLocaleString()})
                </li>
              </>
            )}
          </ul>
        </section>
      )}

      {/* Channel table + chart + AI in header */}
      {rows.length > 0 && (
        <>
          <section style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Traffic by Default Channel Group</h3>
              <span style={{ color: "#666", fontSize: 12 }}>Showing <b>{fmtDate(startDate)}</b> → <b>{fmtDate(endDate)}</b></span>
              <AiBlock
                endpoint="/api/insights/summarise"
                payload={{ rows, totals, dateRange: { start: startDate, end: endDate } }}
                disabled={false}
              />
            </div>

            <div style={{ overflowX: "auto", marginTop: 10 }}>
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

            <div style={{ marginTop: 16 }}>
              <img
                src={buildChannelPieUrl(rows)}
                alt="Channel share chart"
                style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
              />
            </div>
          </section>
        </>
      )}

      {/* Sections that fetch on demand */}
      {propertyId && <TopPages propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <SourceMedium propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <Products propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <EcommerceKPIs propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <CheckoutFunnel propertyId={propertyId} startDate={startDate} endDate={endDate} />}
    </main>
  );
}

/* ===========================
   Components below
   =========================== */

/* --- Top Pages --- */
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Top pages (views)</h3>
        <span style={{ color: "#666", fontSize: 12 }}>Showing <b>{fmtDate(startDate)}</b> → <b>{fmtDate(endDate)}</b></span>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Top Pages"}
        </button>
        <AiBlock
          endpoint="/api/insights/summarise-pages"
          payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          disabled={!rows.length}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
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
      ) : (!loading && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* --- Source / Medium --- */
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
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 20 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r, i) => ({
        source: r.dimensionValues?.[0]?.value || "(unknown)",
        medium: r.dimensionValues?.[1]?.value || "(unknown)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        conversions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <span style={{ color: "#666", fontSize: 12 }}>Showing <b>{fmtDate(startDate)}</b> → <b>{fmtDate(endDate)}</b></span>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source/Medium"}
        </button>
        <AiBlock
          endpoint="/api/insights/summarise-source-medium"
          payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          disabled={!rows.length}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Conversions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.medium}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.conversions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{currency(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!loading && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* --- Products --- */
function Products({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]); setNote("");
    try {
      const res = await fetch("/api/ga4/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 50 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r, i) => ({
        name: r.dimensionValues?.[0]?.value || "(unknown)",
        id: r.dimensionValues?.[1]?.value || `row-${i}`,
        itemsViewed: Number(r.metricValues?.[0]?.value || 0),
        itemsAddedToCart: Number(r.metricValues?.[1]?.value || 0),
        itemsPurchased: Number(r.metricValues?.[2]?.value || 0),
        itemRevenue: Number(r.metricValues?.[3]?.value || 0),
      }));

      if (!parsed.length) {
        setNote(
          "No product rows returned for this date range. If GA’s E-commerce Purchases report shows items, make sure events include an items[] with item_id / item_name."
        );
      }
      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const downloadCsvProducts = (rows, start, end) => {
    if (!rows?.length) return;
    const header = ["Item name", "Item ID", "Items viewed", "Items added to cart", "Items purchased", "Item revenue"];
    const lines = rows.map((r) => [
      r.name, r.id, r.itemsViewed, r.itemsAddedToCart, r.itemsPurchased, r.itemRevenue,
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const filename = `ga4_products_${start}_to_${end}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Product performance</h3>
        <span style={{ color: "#666", fontSize: 12 }}>Showing <b>{fmtDate(startDate)}</b> → <b>{fmtDate(endDate)}</b></span>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Products"}
        </button>
        <button
          onClick={() => downloadCsvProducts(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Load products first"}
        >
          Download CSV
        </button>
        <AiBlock
          endpoint="/api/insights/summarise-products"
          payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          disabled={!rows.length}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {note && !error && <p style={{ color: "#666", marginTop: 8 }}>{note}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Item</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>ID</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items viewed</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items added to cart</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items purchased</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Item revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.id}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.id}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.itemsViewed.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.itemsAddedToCart.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.itemsPurchased.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{currency(r.itemRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!loading && !error && !note && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* --- E-commerce KPIs --- */
function EcommerceKPIs({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");

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

  const canSummarise = Boolean(totals && startDate && endDate);

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <span style={{ color: "#666", fontSize: 12 }}>Showing <b>{fmtDate(startDate)}</b> → <b>{fmtDate(endDate)}</b></span>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
        <AiBlock
          endpoint="/api/insights/summarise-ecommerce"
          payload={{ totals, dateRange: { start: startDate, end: endDate } }}
          disabled={!canSummarise}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Metric</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Revenue</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{currency(totals.revenue)}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Purchases</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(totals.purchases || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>AOV</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{currency(totals.aov)}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>CTR</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(Number(totals.ctr || 0)).toFixed(2)}%</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>CVR</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(Number(totals.cvr || 0)).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (!loading && !error && <p style={{ marginTop: 8, color: "#666" }}>No KPIs loaded yet.</p>)}
    </section>
  );
}

/* --- Checkout Funnel --- */
function CheckoutFunnel({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch("/api/ga4/checkout-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);
      setRows(data.rows || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 32, marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checkout funnel</h3>
        <span style={{ color: "#666", fontSize: 12 }}>Showing <b>{fmtDate(startDate)}</b> → <b>{fmtDate(endDate)}</b></span>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Funnel"}
        </button>
        <AiBlock
          endpoint="/api/insights/summarise-funnel"
          payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          disabled={!rows.length}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Step</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Drop-off %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.step}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(r.users || 0).toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(Number(r.dropoff || 0)).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!loading && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}
