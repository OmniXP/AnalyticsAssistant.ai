import { useEffect, useMemo, useState } from "react";

/** ===================== helpers ===================== */
const STORAGE_KEY = "insightgpt_preset_v2";

// parse GA4 channel-group response -> rows/totals
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

// CSV for the channel table
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
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// QuickChart pie image
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

// unified POST helper (text first, then JSON)
async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.details?.error?.message ||
      txt ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data || {};
}

function safeFilter(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === "all") return null;
  return s;
}

/** ===================== page ===================== */
export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  // Global filters (free-text “All” clears)
  const [country, setCountry] = useState("All");
  const [channelGroup, setChannelGroup] = useState("All");

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Load preset
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      if (saved?.startDate) setStartDate(saved.startDate);
      if (saved?.endDate) setEndDate(saved.endDate);
      if (saved?.country) setCountry(saved.country);
      if (saved?.channelGroup) setChannelGroup(saved.channelGroup);
    } catch {}
  }, []);

  // Save preset
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ propertyId, startDate, endDate, country, channelGroup })
      );
    } catch {}
  }, [propertyId, startDate, endDate, country, channelGroup]);

  const { rows, totals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(
    () => parseGa4Channels(prevResult),
    [prevResult]
  );

  const top = rows[0];
  const topShare = top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

  const connect = () => {
    window.location.href = "/api/auth/google/start";
  };

  // GA4 query with filters
  async function fetchGa4Channels({ propertyId, startDate, endDate, country, channelGroup }) {
    return await postJson("/api/ga4/query", {
      propertyId,
      startDate,
      endDate,
      country: safeFilter(country),
      channel: safeFilter(channelGroup),
    });
  }

  const runReport = async () => {
    setError("");
    setResult(null);
    setPrevResult(null);
    setLoading(true);
    try {
      // current
      const curr = await fetchGa4Channels({
        propertyId,
        startDate,
        endDate,
        country,
        channelGroup,
      });
      setResult(curr);

      // previous (optional)
      if (comparePrev) {
        const { prevStart, prevEnd } = computePreviousRange(startDate, endDate);
        const prev = await fetchGa4Channels({
          propertyId,
          startDate: prevStart,
          endDate: prevEnd,
          country,
          channelGroup,
        });
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
    setCountry("All");
    setChannelGroup("All");
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>Connect GA4, choose a date range, apply optional filters, and view insights.</p>

      {/* Controls */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "end" }}>
        <div>
          <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer", width: "100%" }}>
            Connect Google Analytics
          </button>
        </div>

        <label>GA4 Property ID
          <input
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            style={{ padding: 8, width: "100%" }}
          />
        </label>

        <label>Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: 8, width: "100%" }} />
        </label>
        <label>End date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: 8, width: "100%" }} />
        </label>

        <label>Country (type “All” to clear)
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="All" style={{ padding: 8, width: "100%" }} />
        </label>

        <label>Channel Group (type “All” to clear)
          <input value={channelGroup} onChange={(e) => setChannelGroup(e.target.value)} placeholder="All" style={{ padding: 8, width: "100%" }} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runReport} style={{ padding: "10px 14px", cursor: "pointer", flex: 1 }} disabled={loading || !propertyId}>
            {loading ? "Running…" : "Run GA4 Report"}
          </button>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8 }}>
            <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
            Compare previous
          </label>
          <button onClick={resetPreset} style={{ padding: "10px 14px", cursor: "pointer" }}>
            Reset
          </button>
        </div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Traffic by Default Channel Group</h3>
            <button
              onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
              style={{ padding: "8px 12px", cursor: "pointer" }}
              disabled={!rows.length}
              title={rows.length ? "Download table as CSV" : "Run a report first"}
            >
              Download CSV
            </button>
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* Sections */}
      <TopPages
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        country={country}
        channel={channelGroup}
      />

      <SourceMedium
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        country={country}
        channel={channelGroup}
      />

      <EcommerceKPIs
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        country={country}
        channel={channelGroup}
      />

      <CheckoutFunnel
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        country={country}
        channel={channelGroup}
      />
    </main>
  );
}

/** ===================== Top Pages ===================== */
function TopPages({ propertyId, startDate, endDate, country, channel }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await postJson("/api/ga4/top-pages", {
        propertyId, startDate, endDate,
        country: safeFilter(country),
        channel: safeFilter(channel),
        limit: 25,
      });
      const parsed = (data.rows || []).map((r, i) => ({
        title: r.dimensionValues?.[0]?.value || "(untitled)",
        path: r.dimensionValues?.[1]?.value || "",
        views: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        key: `row-${i}`,
      }));
      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summarise = async () => {
    setAiLoading(true); setAiText("");
    try {
      const res = await fetch("/api/insights/summarise-top-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dateRange: { start: startDate, end: endDate } }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data?.error || data?.message || txt || `HTTP ${res.status}`));
      setAiText(data?.summary || txt || "No response");
    } catch (e) {
      setAiText("");
      setError(String(e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!rows.length) return;
    const header = ["Title", "Path", "Views", "Users"];
    const lines = rows.map((r) => [r.title, r.path, r.views, r.users]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ga4_top_pages_${startDate}_to_${endDate}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Top pages (views)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Top Pages"}
        </button>
        <button onClick={downloadCsv} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!rows.length}>
          Download CSV
        </button>
        <button onClick={summarise} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!rows.length || aiLoading}>
          {aiLoading ? "Summarising…" : "Summarise with AI"}
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
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.title}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.path}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.views.toLocaleString()}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aiText && (
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
              {aiText}
            </div>
          )}
        </>
      )}
      {!loading && !error && rows.length === 0 && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}

/** ===================== Source / Medium ===================== */
function SourceMedium({ propertyId, startDate, endDate, country, channel }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const load = async () => {
    if (!propertyId) return;
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await postJson("/api/ga4/source-medium", {
        propertyId, startDate, endDate,
        country: safeFilter(country),
        channel: safeFilter(channel),
        limit: 30,
      });
      const parsed = (data.rows || []).map((r, i) => ({
        source: r.dimensionValues?.[0]?.value || "(none)",
        medium: r.dimensionValues?.[1]?.value || "(none)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        key: `row-${i}`,
      }));
      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summarise = async () => {
    setAiLoading(true); setAiText("");
    try {
      const res = await fetch("/api/insights/summarise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            channel: `${r.source} / ${r.medium}`,
            sessions: r.sessions,
            users: r.users,
          })),
          totals: {
            sessions: rows.reduce((a, r) => a + r.sessions, 0),
            users: rows.reduce((a, r) => a + r.users, 0),
          },
          dateRange: { start: startDate, end: endDate },
        }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data?.error || data?.message || txt || `HTTP ${res.status}`));
      setAiText(data?.summary || txt || "No response");
    } catch (e) {
      setAiText("");
      setError(String(e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!rows.length) return;
    const header = ["Source", "Medium", "Sessions", "Users"];
    const lines = rows.map((r) => [r.source, r.medium, r.sessions, r.users]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ga4_source_medium_${startDate}_to_${endDate}.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source / Medium"}
        </button>
        <button onClick={downloadCsv} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!rows.length}>
          Download CSV
        </button>
        <button onClick={summarise} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!rows.length || aiLoading}>
          {aiLoading ? "Summarising…" : "Summarise with AI"}
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
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && rows.length === 0 && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
      {aiText && (
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
          {aiText}
        </div>
      )}
    </section>
  );
}

/** ===================== E-commerce KPIs ===================== */
function EcommerceKPIs({ propertyId, startDate, endDate, country, channel }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");
  const [ai, setAi] = useState({ loading: false, text: "", error: "" });

  const load = async () => {
    setLoading(true); setError(""); setTotals(null);
    try {
      const data = await postJson("/api/ga4/ecommerce-summary", {
        propertyId, startDate, endDate,
        country: safeFilter(country),
        channel: safeFilter(channel),
      });
      setTotals(data?.totals || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const summarise = async () => {
    if (!totals) return;
    setAi({ loading: true, text: "", error: "" });
    try {
      const res = await fetch("/api/insights/summarise-ecommerce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totals,
          dateRange: { start: startDate, end: endDate },
        }),
      });
      const txt = await res.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
      if (!res.ok) throw new Error((data?.error || data?.message || txt || `HTTP ${res.status}`));
      setAi({ loading: false, text: data?.summary || txt || "No response", error: "" });
    } catch (e) {
      setAi({ loading: false, text: "", error: String(e.message || e) });
    }
  };

  const currency = "£"; // UI only; GA returns totals in metadata.currencyCode if needed

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
        <button onClick={summarise} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!totals || ai.loading}>
          {ai.loading ? "Summarising…" : "Summarise with AI"}
        </button>
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
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Sessions</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(totals.sessions || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Total users</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(totals.users || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Purchases</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(totals.purchases || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>Revenue</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                  {currency}{Number(totals.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>AOV</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                  {currency}{Number(totals.aov || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr>
                <td style={{ padding: 8, borderBottom: "1px solid " }}>CVR (purchase/session)</td>
                <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " }}>
                  {Number(totals.cvr || 0).toFixed(2)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {ai.error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>AI: {ai.error}</p>}
      {ai.text && (
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
          {ai.text}
        </div>
      )}
      {!loading && !error && !totals && <p style={{ marginTop: 8, color: "#666" }}>No KPIs loaded yet.</p>}
    </section>
  );
}

/** ===================== Checkout Funnel ===================== */
function CheckoutFunnel({ propertyId, startDate, endDate, country, channel }) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setSteps(null);
    try {
      const data = await postJson("/api/ga4/checkout-funnel", {
        propertyId, startDate, endDate,
        country: safeFilter(country),
        channel: safeFilter(channel),
      });
      setSteps(data?.steps || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 32, marginBottom: 56 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checkout funnel (event counts)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Checkout Funnel"}
        </button>
      </div>
      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {steps && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Step</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Add to cart", steps.add_to_cart],
                ["Begin checkout", steps.begin_checkout],
                ["Add shipping", steps.add_shipping_info],
                ["Add payment", steps.add_payment_info],
                ["Purchase", steps.purchase],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(value || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && !steps && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>}
    </section>
  );
}
