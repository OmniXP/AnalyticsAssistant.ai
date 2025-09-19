// /workspaces/insightsgpt/web/pages/index.js
import { useEffect, useMemo, useState } from "react";

/* =========================
   Helpers (pure functions)
   ========================= */

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

/* CSV helpers */
function triggerCsvDownload(csv, filename) {
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
  triggerCsvDownload(csv, `ga4_channels_${startDate}_to_${endDate}.csv`);
}

function downloadCsvTopPages(rows, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Page Title", "Path", "Views", "Users"];
  const lines = rows.map((r) => [r.title, r.path, r.views, r.users]);
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  triggerCsvDownload(csv, `ga4_top_pages_${startDate}_to_${endDate}.csv`);
}

function downloadCsvSourceMedium(rows, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Source", "Medium", "Sessions", "Users"];
  const lines = rows.map((r) => [r.source, r.medium, r.sessions, r.users]);
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  triggerCsvDownload(csv, `ga4_source_medium_${startDate}_to_${endDate}.csv`);
}

function downloadCsvLandingPages(rows, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Page Title", "Path", "Views", "Sessions", "Users", "Conversions"];
  const lines = rows.map((r) => [r.title, r.path, r.views, r.sessions, r.users, r.conversions]);
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ga4_landing_pages_${startDate}_to_${endDate}.csv`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadCsvCampaigns(rows, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Source", "Medium", "Campaign", "Sessions", "Users", "Views", "Conversions", "Revenue"];
  const lines = rows.map((r) => [r.source, r.medium, r.campaign, r.sessions, r.users, r.views, r.conversions, r.revenue]);
  const csv = [header, ...lines].map(cols => cols.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ga4_campaigns_${startDate}_to_${endDate}.csv`; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function downloadCsvProducts(rows, startDate, endDate) {
  if (!rows?.length) return;
  const header = ["Item Name", "Item ID", "Views", "Add-to-Carts", "Cart-to-View %", "Items Purchased", "Item Revenue"];
  const lines = rows.map((r) => [r.name, r.id, r.views, r.addToCarts, r.cartToViewRate, r.purchased, r.revenue]);
  const csv = [header, ...lines].map(cols => cols.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ga4_products_${startDate}_to_${endDate}.csv`; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function downloadCsvFunnel(t, startDate, endDate) {
  if (!t) return;
  const header = ["Views", "Add-to-Carts", "Checkouts", "Purchases", "Revenue", "ATC %", "Checkout %", "Purchase %", "Overall CVR %"];
  const row = [
    t.views, t.atc, t.checkout, t.purchases, t.revenue,
    t.viewToAtcRate, t.atcToCheckoutRate, t.checkoutToPurchaseRate, t.viewToPurchaseRate
  ];
  const csv = [header, row].map(cols => cols.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `ga4_funnel_${startDate}_to_${endDate}.csv`; a.style.display="none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* QuickChart (pie) */
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

/* =========================
   Reusable AI block (UI)
   ========================= */
function AiBlock({ endpoint, payload, disabled }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setLoading(true); setError(""); setText("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) {
        const msg = data?.error?.message || data?.error || data?.message || raw || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setText(data?.summary || raw || "No response");
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text || ""); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { setError("Could not copy to clipboard"); }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={run} disabled={loading || disabled} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {loading ? "Summarising…" : "Summarise with AI"}
        </button>
        <button onClick={copy} disabled={!text} style={{ padding: "8px 12px", cursor: "pointer" }}>
          {copied ? "Copied!" : "Copy insight"}
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 8, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {text && (
        <div style={{ marginTop: 8, background: "#fffceb", border: "1px solid #f5e08f", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap" }}>
          {text}
        </div>
      )}
    </div>
  );
}

/* Simple KPI card */
function KpiCard({ label, value }) {
  return (
    <div style={{ background: "#f6f7f8", padding: 14, borderRadius: 8, border: "1px solid #e7e7e7" }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/* =========================
   Page component
   ========================= */

export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Load preset once
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      if (saved?.startDate) setStartDate(saved.startDate);
      if (saved?.endDate) setEndDate(saved.endDate);
    } catch {}
  }, []);

  // Save preset
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
          onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
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

      {/* At a glance (Channels) */}
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

      {/* Table: Default Channel Group */}
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

      {/* Channel share chart */}
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

      {/* Debug JSON */}
      {result && (
        <details style={{ marginTop: 24 }}>
          <summary>Raw GA4 JSON (debug)</summary>
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 16, borderRadius: 8, overflow: "auto" }}>
{JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}

      {/* Extra sections */}
      {propertyId && <TopPages propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <SourceMedium propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <EcommerceKPIs propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <GoalsConversions propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <LandingPages propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <Campaigns propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <Products propertyId={propertyId} startDate={startDate} endDate={endDate} />}
      {propertyId && <CheckoutFunnel propertyId={propertyId} startDate={startDate} endDate={endDate} />}
    </main>
  );
}

/* =========================
   Components (Top-level)
   ========================= */

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
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Top Pages"}
        </button>
        <button
          onClick={() => downloadCsvTopPages(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Load Top Pages first"}
        >
          Download CSV
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {rows.length > 0 && (
        <>
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

          {/* AI summary for Top Pages */}
          <AiBlock
            endpoint="/api/insights/summarise-top-pages"
            disabled={false}
            payload={{
              rows, // [{title, path, views, users}]
              dateRange: { start: startDate, end: endDate },
            }}
          />
        </>
      )}
      {rows.length === 0 && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

function LandingPages({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch("/api/ga4/landing-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 25 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r) => ({
        path: r.dimensionValues?.[0]?.value || "(unknown)",
        title: r.dimensionValues?.[1]?.value || "(untitled)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        views: Number(r.metricValues?.[2]?.value || 0),
        conversions: Number(r.metricValues?.[3]?.value || 0),
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
        <h3 style={{ margin: 0 }}>Landing Pages</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Landing Pages"}
        </button>
        <button
          onClick={() => downloadCsvLandingPages(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Load Landing Pages first"}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Landing page</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Title</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Views</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Conversions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.path}-${i}`}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.path}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.title}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.views.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.conversions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AiBlock
            endpoint="/api/insights/summarise-landing-pages"
            disabled={false}
            payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          />
        </>
      )}
      {rows.length === 0 && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
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
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 25 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r) => ({
        source: r.dimensionValues?.[0]?.value || "(unknown)",
        medium: r.dimensionValues?.[1]?.value || "(unknown)",
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source/Medium"}
        </button>
        <button
          onClick={() => downloadCsvSourceMedium(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Load Source/Medium first"}
        >
          Download CSV
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.source}-${r.medium}-${i}`}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI summary for Source/Medium */}
          <AiBlock
            endpoint="/api/insights/summarise-source-medium"
            disabled={false}
            payload={{
              rows, // [{source, medium, sessions, users}]
              dateRange: { start: startDate, end: endDate },
            }}
          />
        </>
      )}
      {rows.length === 0 && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

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
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) {
        const msg = data?.error?.message || data?.error || data?.message || raw || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!data?.totals?.dateRange) throw new Error("Missing totals/dateRange");
      setTotals(data.totals);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summarise = async () => {
    setAiLoading(true); setAiError(""); setAiText(""); setCopied(false);
    try {
      if (!totals) throw new Error("Load the e-commerce KPIs first.");
      const res = await fetch("/api/insights/summarise-ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totals, dateRange: totals.dateRange }),
      });
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || raw || `HTTP ${res.status}`);
      setAiText(data?.summary || raw || "No response");
    } catch (e) {
      setAiError(String(e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(aiText || ""); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { setAiError("Could not copy to clipboard"); }
  };

  const currency = "GBP";
  const fmtGBP = (n) =>
    Number.isFinite(n) ? n.toLocaleString(undefined, { style: "currency", currency }) : "—";

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
          <KpiCard label="Revenue" value={fmtGBP(totals.revenue)} />
          <KpiCard label="Purchases" value={totals.purchases?.toLocaleString?.() ?? "—"} />
          <KpiCard label="AOV" value={fmtGBP(totals.aov)} />
          <KpiCard label="Purchase CVR" value={`${Number(totals.purchaserRate ?? 0).toFixed(2)}%`} />
          <KpiCard label="Users" value={totals.users?.toLocaleString?.() ?? "—"} />
          <KpiCard label="Sessions" value={totals.sessions?.toLocaleString?.() ?? "—"} />
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

function GoalsConversions({ propertyId, startDate, endDate }) {
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
      const res = await fetch("/api/ga4/conversions-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || raw || `HTTP ${res.status}`);
      if (!data?.totals?.dateRange) throw new Error("Missing totals/dateRange");
      setTotals(data.totals);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summarise = async () => {
    setAiLoading(true); setAiError(""); setAiText(""); setCopied(false);
    try {
      if (!totals) throw new Error("Load the conversions first.");
      const res = await fetch("/api/insights/summarise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "conversions",
          totals,
          dateRange: totals.dateRange,
        }),
      });
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || raw || `HTTP ${res.status}`);
      setAiText(data?.summary || raw || "No response");
    } catch (e) {
      setAiError(String(e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(aiText || ""); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { setAiError("Could not copy to clipboard"); }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Goals & Conversions</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Conversions"}
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
          <KpiCard label="Conversions" value={totals.conversions.toLocaleString()} />
          <KpiCard label="User conversion rate" value={`${Number(totals.userConversionRate ?? 0).toFixed(2)}%`} />
          <KpiCard label="Users" value={totals.users.toLocaleString()} />
          <KpiCard label="Sessions" value={totals.sessions.toLocaleString()} />
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

function Campaigns({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch("/api/ga4/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 50 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r) => ({
        source: r.dimensionValues?.[0]?.value || "(none)",
        medium: r.dimensionValues?.[1]?.value || "(none)",
        campaign: r.dimensionValues?.[2]?.value || "(none)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        views: Number(r.metricValues?.[2]?.value || 0),
        conversions: Number(r.metricValues?.[3]?.value || 0),
        revenue: Number(r.metricValues?.[4]?.value || 0),
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
        <h3 style={{ margin: 0 }}>Campaigns (UTM)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>
        <button
          onClick={() => downloadCsvCampaigns(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Campaign</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Views</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Conversions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.source}-${r.medium}-${r.campaign}-${i}`}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.campaign}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.views.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.conversions.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AiBlock
            endpoint="/api/insights/summarise-campaigns"
            disabled={false}
            payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          />
        </>
      )}
      {rows.length === 0 && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

function Products({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const res = await fetch("/api/ga4/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate, limit: 50 }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const parsed = (data.rows || []).map((r) => ({
        name: r.dimensionValues?.[0]?.value || "(unknown)",
        id: r.dimensionValues?.[1]?.value || "",
        views: Number(r.metricValues?.[0]?.value || 0),
        addToCarts: Number(r.metricValues?.[1]?.value || 0),
        cartToViewRate: Number(r.metricValues?.[2]?.value || 0), // already a %
        purchased: Number(r.metricValues?.[3]?.value || 0),
        revenue: Number(r.metricValues?.[4]?.value || 0),
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
        <h3 style={{ margin: 0 }}>Product performance</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Products"}
        </button>
        <button
          onClick={() => downloadCsvProducts(rows, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 && (
        <>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Item</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>ID</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Views</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Add-to-Carts</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Cart-to-View %</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items Purchased</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Item Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.id}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.views.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.addToCarts.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.cartToViewRate.toFixed(2)}%</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.purchased.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " +
                      "#eee" }}>{r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AiBlock
            endpoint="/api/insights/summarise-products"
            disabled={false}
            payload={{ rows, dateRange: { start: startDate, end: endDate } }}
          />
        </>
      )}
      {rows.length === 0 && !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

function CheckoutFunnel({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);

  const pct = (num, den) => {
    if (!den) return 0;
    return Math.round((num / den) * 10000) / 100; // 2 dp
  };

  const load = async () => {
    setLoading(true); setError(""); setTotals(null);
    try {
      const res = await fetch("/api/ga4/funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);

      const mv = (data.rows?.[0]?.metricValues || []).map(m => Number(m.value || 0));
      const views = mv[0] || 0;
      const atc = mv[1] || 0;
      const checkout = mv[2] || 0;
      const purchases = mv[3] || 0;
      const revenue = mv[4] || 0;

      const computed = {
        views, atc, checkout, purchases, revenue,
        viewToAtcRate: pct(atc, views),
        atcToCheckoutRate: pct(checkout, atc),
        checkoutToPurchaseRate: pct(purchases, checkout),
        viewToPurchaseRate: pct(purchases, views),
      };
      setTotals(computed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summarise = async () => {
    if (!totals) return;
    setAiLoading(true); setAiError(""); setAiText(""); setCopied(false);
    try {
      const res = await fetch("/api/insights/summarise-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totals, dateRange: { start: startDate, end: endDate } }),
      });
      const raw = await res.text();
      let data = null; try { data = raw ? JSON.parse(raw) : null; } catch {}
      if (!res.ok) throw new Error((data && (data.error || data.message)) || raw || `HTTP ${res.status}`);
      setAiText(data?.summary || raw || "No response");
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

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checkout funnel</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Funnel"}
        </button>
        <button
          onClick={() => totals && downloadCsvFunnel(totals, startDate, endDate)}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!totals}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Step</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Count</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Product Views</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.views.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>—</td>
                </tr>
                <tr>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Add to Cart</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.atc.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.viewToAtcRate}% of views</td>
                </tr>
                <tr>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Checkout</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.checkout.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.atcToCheckoutRate}% of ATC</td>
                </tr>
                <tr>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Purchase</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.purchases.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{totals.checkoutToPurchaseRate}% of checkout</td>
                </tr>
                <tr>
                  <td style={{ padding: 8, borderTop: "2px solid #ccc" }}><b>Revenue</b></td>
                  <td style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }}>
                    <b>{totals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }}><b>Overall CVR: {totals.viewToPurchaseRate}%</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button onClick={summarise} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={aiLoading || !totals}>
              {aiLoading ? "Summarising…" : "Summarise with AI"}
            </button>
            <button onClick={async () => { await navigator.clipboard.writeText(aiText || ""); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
              style={{ padding: "8px 12px", cursor: "pointer" }}
              disabled={!aiText}
            >
              {copied ? "Copied!" : "Copy insight"}
            </button>
          </div>
          {aiError && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {aiError}</p>}
          {aiText && (
            <div style={{ marginTop: 12, background: "#fffceb", border: "1px solid #f5e08f", padding: 12, borderRadius: 6, whiteSpace: "pre-wrap" }}>
              {aiText}
            </div>
          )}
        </>
      )}

      {!totals && !error && <p style={{ marginTop: 8, color: "#666" }}>No funnel loaded yet.</p>}
    </section>
  );
}
