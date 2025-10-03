// /workspaces/insightsgpt/web/pages/index.js
import { useEffect, useMemo, useState } from "react";

/* ============================== Helpers ============================== */
const STORAGE_KEY = "insightgpt_preset_v4";

const COUNTRY_OPTIONS = [
  "All",
  "United Kingdom",
  "United States",
  "Ireland",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Australia",
  "Canada",
  "India",
];

const CHANNEL_GROUP_OPTIONS = [
  "All",
  "Direct",
  "Organic Search",
  "Paid Search",
  "Organic Social",
  "Paid Social",
  "Email",
  "Referral",
  "Display",
  "Video",
  "Affiliates",
  "Organic Shopping",
  "Paid Shopping",
];

function parseGa4Channels(response) {
  if (!response?.rows?.length) return { rows: [], totals: { sessions: 0, users: 0 } };
  const rows = response.rows.map((r) => ({
    channel: r.dimensionValues?.[0]?.value || "(unknown)",
    sessions: Number(r.metricValues?.[0]?.value || 0),
    users: Number(r.metricValues?.[1]?.value || 0),
  }));
  const totals = rows.reduce(
    (a, r) => ({ sessions: a.sessions + r.sessions, users: a.users + r.users }),
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

/** CSV exports */
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

function downloadCsvGeneric(filenamePrefix, rows, columns) {
  if (!rows?.length) return;
  const header = columns.map((c) => c.header);
  const lines = rows.map((r) => columns.map((c) => r[c.key]));
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const filename = `${filenamePrefix}.csv`;
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

/** Unified fetch helper: read text -> try JSON -> show real error */
async function fetchJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.details?.error?.message ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data || {};
}

/* ============================== Page ============================== */
export default function Home() {
  // Base controls
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  // Filter UI
  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");

  // Applied filters for queries
  const [appliedFilters, setAppliedFilters] = useState({
    country: "All",
    channelGroup: "All",
  });

  // Key to remount sections on reset (clears their internal state)
  const [dashKey, setDashKey] = useState(0);

  // Channel results (main hero)
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
      if (saved?.appliedFilters) setAppliedFilters(saved.appliedFilters);
      if (saved?.countrySel) setCountrySel(saved.countrySel);
      if (saved?.channelSel) setChannelSel(saved.channelSel);
    } catch {}
  }, []);

  // Save preset whenever these change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          propertyId,
          startDate,
          endDate,
          appliedFilters,
          countrySel,
          channelSel,
        })
      );
    } catch {}
  }, [propertyId, startDate, endDate, appliedFilters, countrySel, channelSel]);

  const { rows, totals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(
    () => parseGa4Channels(prevResult),
    [prevResult]
  );

  const top = rows[0];

  const connect = () => {
    window.location.href = "/api/auth/google/start";
  };

  // Apply filters button
  const applyFilters = () => {
    setAppliedFilters({
      country: countrySel,
      channelGroup: channelSel,
    });
  };

  // Whether UI differs from applied filters (show reminder)
  const filtersDirty =
    countrySel !== (appliedFilters?.country || "All") ||
    channelSel !== (appliedFilters?.channelGroup || "All");

  // Channel report (uses filters)
  async function fetchGa4Channels({ propertyId, startDate, endDate, filters }) {
    return fetchJson("/api/ga4/query", { propertyId, startDate, endDate, filters });
  }

  const runReport = async () => {
    setError("");
    setResult(null);
    setPrevResult(null);
    setLoading(true);
    try {
      // Current period with filters
      const curr = await fetchGa4Channels({
        propertyId,
        startDate,
        endDate,
        filters: appliedFilters,
      });
      setResult(curr);

      // Previous period (optional)
      if (comparePrev) {
        const { prevStart, prevEnd } = computePreviousRange(startDate, endDate);
        const prev = await fetchGa4Channels({
          propertyId,
          startDate: prevStart,
          endDate: prevEnd,
          filters: appliedFilters,
        });
        setPrevResult(prev);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset dashboard (keep propertyId; clear everything else + remount sections)
  const resetDashboard = () => {
    setStartDate("2024-09-01");
    setEndDate("2024-09-30");
    setComparePrev(false);
    setCountrySel("All");
    setChannelSel("All");
    setAppliedFilters({ country: "All", channelGroup: "All" });
    setResult(null);
    setPrevResult(null);
    setError("");
    setDashKey((k) => k + 1); // force children to remount & clear
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Connect GA4, choose a date range, optionally apply filters, and view traffic & insights.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Connect Google Analytics
        </button>

        <label>GA4 Property ID&nbsp;
          <input
            id="property-id"
            name="property-id"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            style={{ padding: 8, minWidth: 180 }}
          />
        </label>

        <label>Start date&nbsp;
          <input id="start-date" name="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: 8 }} />
        </label>
        <label>End date&nbsp;
          <input id="end-date" name="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: 8 }} />
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
          <input id="compare-prev" type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          Compare vs previous period
        </label>

        <button onClick={resetDashboard} style={{ padding: "8px 12px", cursor: "pointer", marginLeft: "auto" }}>
          Reset Dashboard
        </button>
      </div>

      {/* Filters */}
      <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>Filters:</b>
          <label>Country&nbsp;
            <select id="country-filter" value={countrySel} onChange={(e) => setCountrySel(e.target.value)} style={{ padding: 8 }}>
              {COUNTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>Channel Group&nbsp;
            <select id="channel-filter" value={channelSel} onChange={(e) => setChannelSel(e.target.value)} style={{ padding: 8 }}>
              {CHANNEL_GROUP_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <button onClick={applyFilters} style={{ padding: "8px 12px", cursor: "pointer" }}>Apply filters</button>
          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span style={{ background: "#e6f4ea", color: "#137333", padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
              Filters active: {appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}
              {appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}
              {appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}
            </span>
          )}
        </div>

        {/* Helper & reminder */}
        <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
          Tip: pick a Country and/or Channel Group, click <b>Apply filters</b>, then run the relevant reports.
          {filtersDirty && (
            <div style={{ marginTop: 8, background: "#fff8e1", border: "1px solid #f3d37a", padding: 8, borderRadius: 6 }}>
              <b>Filters changed but not applied.</b> Click <b>Apply filters</b> to use them in queries.
            </div>
          )}
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 16 }}>Error: {error}</p>}

      {/* At a glance + Channels */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24, background: "#f6f7f8", padding: 16, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Traffic by Default Channel Group</h2>
            <AiBlock
              asButton
              buttonLabel="Summarise with AI"
              endpoint="/api/insights/summarise-pro"
              payload={{
                topic: "channels",
                rows,
                totals,
                dateRange: { start: startDate, end: endDate },
                filters: appliedFilters,
              }}
              disabled={!rows.length}
            />
          </div>

          <ul style={{ marginTop: 12 }}>
            <li><b>Total sessions:</b> {Number(totals.sessions || 0).toLocaleString()}</li>
            <li><b>Total users:</b> {Number(totals.users || 0).toLocaleString()}</li>
            {top && (
              <li>
                <b>Top channel:</b> {top.channel} with {Number(top.sessions || 0).toLocaleString()} sessions ({Math.round((Number(top.sessions || 0) / Math.max(Number(totals.sessions || 0), 1)) * 100)}% of total)
              </li>
            )}
            {prevRows.length > 0 && (
              <>
                <li style={{ marginTop: 6 }}>
                  <b>Sessions vs previous:</b>{" "}
                  {formatPctDelta(Number(totals.sessions || 0), Number(prevTotals.sessions || 0))} (prev {Number(prevTotals.sessions || 0).toLocaleString()})
                </li>
                <li>
                  <b>Users vs previous:</b>{" "}
                  {formatPctDelta(Number(totals.users || 0), Number(prevTotals.users || 0))} (prev {Number(prevTotals.users || 0).toLocaleString()})
                </li>
              </>
            )}
          </ul>

          {/* Table */}
          <div style={{ marginTop: 8, overflowX: "auto" }}>
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
                  const pct = (Number(totals.sessions || 0) > 0)
                    ? Math.round((Number(r.sessions || 0) / Number(totals.sessions || 0)) * 100)
                    : 0;
                  return (
                    <tr key={r.channel}>
                      <td style={{ padding: 8, borderBottom: "1px solid " + "#eee" }}>{r.channel}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " + "#eee" }}>{Number(r.sessions || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " + "#eee" }}>{Number(r.users || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " + "#eee" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Channel pie */}
          <div style={{ marginTop: 16 }}>
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>
        </section>
      )}

      {/* Source / Medium */}
      <SourceMedium
        key={`sm-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      {/* Top pages */}
      <TopPages
        key={`tp-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      {/* E-commerce KPIs */}
      <EcommerceKPIs
        key={`ek-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      {/* Checkout funnel */}
      <CheckoutFunnel
        key={`cf-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      {/* Raw JSON (debug) */}
      {result && (
        <details style={{ marginTop: 24 }}>
          <summary>Raw GA4 JSON (debug)</summary>
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 16, borderRadius: 8, overflow: "auto" }}>
{JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}
    </main>
  );
}

/* ============================== Reusable AI block ============================== */
function AiBlock({ asButton = false, buttonLabel = "Summarise with AI", endpoint, payload, disabled = false }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (disabled) return;
    setLoading(true); setError(""); setText(""); setCopied(false);
    try {
      const data = await fetchJson(endpoint, payload);
      const summary = data?.summary || (typeof data === "string" ? data : "");
      setText(summary || "No response");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(text || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Could not copy to clipboard"); }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={run} style={{ padding: "8px 12px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }} disabled={loading || disabled}>
        {loading ? "Summarising…" : (asButton ? buttonLabel : "Summarise with AI")}
      </button>
      <button onClick={copy} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!text}>
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: "crimson" }}>Error: {error}</span>}
      {text && (
        <div
          style={{
            marginTop: 8,
            background: "#fffceb",
            border: "1px solid #f5e08f",
            padding: 10,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            width: "100%",
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

/* ============================== Source / Medium ============================== */
function SourceMedium({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/source-medium", {
        propertyId, startDate, endDate, filters, limit: 25,
      });
      const parsed = (data?.rows || []).map((r, i) => ({
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
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source / Medium"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "source_medium", rows, dateRange: { start: startDate, end: endDate }, filters }}
          disabled={!rows.length}
        />
        <button
          onClick={() =>
            downloadCsvGeneric(
              `source_medium_${startDate}_to_${endDate}`,
              rows,
              [
                { header: "Source", key: "source" },
                { header: "Medium", key: "medium" },
                { header: "Sessions", key: "sessions" },
                { header: "Users", key: "users" },
              ]
            )
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>
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
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.medium}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(r.sessions || 0).toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(r.users || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* ============================== Top Pages ============================== */
function TopPages({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/top-pages", { propertyId, startDate, endDate, filters, limit: 20 });
      const parsed = (data?.rows || []).map((r, i) => ({
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
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Top pages (views)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Top Pages"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "pages", rows, dateRange: { start: startDate, end: endDate }, filters }}
          disabled={!rows.length}
        />
        <button
          onClick={() =>
            downloadCsvGeneric(
              `top_pages_${startDate}_to_${endDate}`,
              rows,
              [
                { header: "Title", key: "title" },
                { header: "Path", key: "path" },
                { header: "Views", key: "views" },
                { header: "Users", key: "users" },
              ]
            )
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>
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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(r.views || 0).toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(r.users || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* ============================== E-commerce KPIs ============================== */
function EcommerceKPIs({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setTotals(null);
    try {
      const data = await fetchJson("/api/ga4/ecommerce-summary", {
        propertyId, startDate, endDate, filters,
      });
      setTotals(data?.totals || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "ecom_kpis",
            totals,
            dateRange: { start: startDate, end: endDate },
            filters,
            currency: "GBP",
          }}
          disabled={!totals}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && totals && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Metric</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              <Tr label="Sessions" value={totals.sessions} />
              <Tr label="Users" value={totals.users} />
              <Tr label="Add-to-Cart (events)" value={totals.addToCarts} />
              <Tr label="Begin Checkout (events)" value={totals.beginCheckout} />
              <Tr label="Purchases (transactions)" value={totals.transactions} />
              <Tr label="Revenue" value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} />
              <Tr label="Conversion Rate (purchase / session)" value={`${Number(totals.cvr || 0).toFixed(2)}%`} />
              <Tr label="AOV (Revenue / Transactions)" value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.aov || 0)} />
            </tbody>
          </table>
        </div>
      )}
      {!error && !totals && <p style={{ marginTop: 8, color: "#666" }}>No data loaded yet.</p>}
    </section>
  );
}

function Tr({ label, value }) {
  const formatted =
    typeof value === "string"
      ? value
      : (value ?? 0)?.toLocaleString
      ? value.toLocaleString()
      : String(value ?? 0);
  return (
    <tr>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid " + "#eee" }}>{formatted}</td>
    </tr>
  );
}

/* ============================== Checkout Funnel ============================== */
function CheckoutFunnel({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setSteps(null);
    try {
      const data = await fetchJson("/api/ga4/checkout-funnel", {
        propertyId, startDate, endDate, filters,
      });
      setSteps(data?.steps || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Derived funnel rates to help the AI summary (and could be shown later)
  const rates = (() => {
    if (!steps) return null;
    const add = Number(steps.add_to_cart || 0);
    const chk = Number(steps.begin_checkout || 0);
    const ship = Number(steps.add_shipping_info || 0);
    const pay = Number(steps.add_payment_info || 0);
    const pur = Number(steps.purchase || 0);
    const safeDiv = (a, b) => (b > 0 ? (a / b) * 100 : 0);
    return {
      add_to_checkout: safeDiv(chk, add),
      checkout_to_shipping: safeDiv(ship, chk),
      shipping_to_payment: safeDiv(pay, ship),
      payment_to_purchase: safeDiv(pur, pay),
      add_to_purchase: safeDiv(pur, add),
    };
  })();

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checkout funnel (event counts)</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Checkout Funnel"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "checkout",
            steps,
            rates,
            dateRange: { start: startDate, end: endDate },
            filters,
            // Extra context hint to improve depth (server can use this to expand with hypotheses/tests)
            guidance: {
              includeDropoffs: true,
              includeQuickWins: true,
              includeHypotheses: true,
              minExperiments: 2,
            },
          }}
          disabled={!steps}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {steps ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 520 }}>
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
              ].map(([label, val]) => (
                <tr key={label}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{Number(val || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </section>
  );
}
