// /workspaces/insightsgpt/web/pages/index.js
import { useEffect, useMemo, useState } from "react";

/* ============================== Helpers ============================== */

/** -------- URL helpers (Saved Views) -------- */
function encodeQuery(state) {
  const p = new URLSearchParams();
  if (state.startDate) p.set("start", state.startDate);
  if (state.endDate) p.set("end", state.endDate);
  if (state.appliedFilters?.country && state.appliedFilters.country !== "All") {
    p.set("country", state.appliedFilters.country);
  }
  if (state.appliedFilters?.channelGroup && state.appliedFilters.channelGroup !== "All") {
    p.set("channel", state.appliedFilters.channelGroup);
  }
  if (state.comparePrev) p.set("compare", "1");
  return p.toString();
}

function decodeQuery() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const q = Object.fromEntries(p.entries());
  return {
    startDate: q.start || null,
    endDate: q.end || null,
    country: q.country || "All",
    channelGroup: q.channel || "All",
    comparePrev: q.compare === "1",
  };
}

async function copyCurrentUrl() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}

const STORAGE_KEY = "insightgpt_preset_v2";

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

/** CSV (channels) */
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

/** CSV (generic) */
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

/** Safe stringify for debug block */
function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (e) {
    try {
      const seen = new WeakSet();
      const replacer = (_, v) => {
        if (v && typeof v === "object") {
          if (seen.has(v)) return "[[circular]]";
          seen.add(v);
        }
        return v;
      };
      return JSON.stringify(value, replacer, 2);
    } catch {
      return String(value);
    }
  }
}

/* ============================== Page ============================== */
export default function Home() {
  // Base controls
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  // Fires whenever the user runs a fresh report (to reset AI & section data)
const [refreshSignal, setRefreshSignal] = useState(0);

  // Filter controls (current selectors)
  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");

  // Filters actually applied to queries
  const [appliedFilters, setAppliedFilters] = useState({
    country: "All",
    channelGroup: "All",
  });

  // Re-mount key for hard resets
  const [dashKey, setDashKey] = useState(1);

  // Channel results (main hero)
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Load preset once
  // Load from URL (if present) ONCE after mount
useEffect(() => {
  try {
    if (typeof window === "undefined") return;
    const q = decodeQuery();
    if (!q) return;

    // Only override if query has something meaningful
    if (q.startDate) setStartDate(q.startDate);
    if (q.endDate) setEndDate(q.endDate);

    // Reflect filters in both selectors and applied filters,
    // but keep "All" if not provided in URL
    setCountrySel(q.country || "All");
    setChannelSel(q.channelGroup || "All");
    setAppliedFilters({
      country: q.country || "All",
      channelGroup: q.channelGroup || "All",
    });

    setComparePrev(!!q.comparePrev);
  } catch {}
}, []);

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
  const topShare =
    top && totals.sessions > 0
      ? Math.round((top.sessions / totals.sessions) * 100)
      : 0;

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

      // Update URL to reflect the view we just ran
try {
  const qs = encodeQuery({ startDate, endDate, appliedFilters, comparePrev });
  const path = window.location.pathname + (qs ? `?${qs}` : "");
  window.history.replaceState(null, "", path);
} catch {}


      // broadcast "new context" so sections & AI summaries reset
      setRefreshSignal((n) => n + 1);

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

  // Reset Dashboard:
  // - Keep propertyId (per your request)
  // - Reset dates to defaults
  // - Clear filters to "All"
  // - Clear current results
  // - Remount data sections to clear their internal state
  const resetDashboard = resetPreset;{
  // Keep propertyId, reset everything else
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}

  setStartDate("2024-09-01");
  setEndDate("2024-09-30");
  setCountrySel("All");
  setChannelSel("All");
  setAppliedFilters({ country: "All", channelGroup: "All" });
  setComparePrev(false);

  // Clear section data so the dashboard visibly resets
  setResult(null);
  setPrevResult(null);
  setError("");

  // Remove any saved-view querystring (?start=...&end=... etc.)
  try {
    const path = window.location.pathname;
    window.history.replaceState(null, "", path);
  } catch {}
};

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Connect GA4, choose a date range, optionally apply filters, and view traffic & insights.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Connect Google Analytics
        </button>

        <label>
          GA4 Property ID&nbsp;
          <input
            id="property-id"
            name="property-id"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            style={{ padding: 8, minWidth: 180 }}
          />
        </label>

        <label>
          Start date&nbsp;
          <input
            id="start-date"
            name="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: 8 }}
          />
        </label>
        <label>
          End date&nbsp;
          <input
            id="end-date"
            name="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: 8 }}
          />
        </label>

        <button
          onClick={runReport}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={loading || !propertyId}
        >
          {loading ? "Running…" : "Run GA4 Report"}
        </button>

        <button
          onClick={async () => {
          // Ensure URL reflects current selections before copying
          try {
          const qs = encodeQuery({ startDate, endDate, appliedFilters, comparePrev });
          const path = window.location.pathname + (qs ? `?${qs}` : "");
          window.history.replaceState(null, "", path);
          } catch {}
          const ok = await copyCurrentUrl();
          if (!ok) alert("Could not copy to clipboard.");
         }}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
         Copy share link
        </button>


        <button
          onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Run a report first"}
        >
          Download CSV
        </button>

        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            paddingLeft: 8,
            borderLeft: "1px solid #ddd",
          }}
        >
          <input
            id="compare-prev"
            type="checkbox"
            checked={comparePrev}
            onChange={(e) => setComparePrev(e.target.checked)}
          />
          Compare vs previous period
        </label>

        <button
          onClick={resetDashboard}
          style={{ padding: "8px 12px", cursor: "pointer", marginLeft: "auto" }}
        >
          Reset Dashboard
        </button>
      </div>

      {/* Filters */}
      <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>Filters:</b>
          <label>
            Country&nbsp;
            <select
              id="country-filter"
              value={countrySel}
              onChange={(e) => setCountrySel(e.target.value)}
              style={{ padding: 8 }}
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label>
            Channel Group&nbsp;
            <select
              id="channel-filter"
              value={channelSel}
              onChange={(e) => setChannelSel(e.target.value)}
              style={{ padding: 8 }}
            >
              {CHANNEL_GROUP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <button onClick={applyFilters} style={{ padding: "8px 12px", cursor: "pointer" }}>
            Apply filters
          </button>
          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span
              style={{
                background: "#e6f4ea",
                color: "#137333",
                padding: "4px 8px",
                borderRadius: 999,
                fontSize: 12,
              }}
            >
              Filters active:&nbsp;
              {appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}
              {appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}
              {appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}
            </span>
          )}
          <span style={{ color: "#666", fontSize: 12 }}>
            Filters apply when you run a section (e.g. GA4 Report / Load buttons).
          </span>
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
             endpoint="/api/insights/summarise"
             payload={{ rows, totals, dateRange: { start: startDate, end: endDate }, filters: appliedFilters }}
             resetSignal={refreshSignal}
           />

          </div>

          <ul style={{ marginTop: 12 }}>
            <li>
              <b>Total sessions:</b> {totals.sessions.toLocaleString()}
            </li>
            <li>
              <b>Total users:</b> {totals.users.toLocaleString()}
            </li>
            {top && (
              <li>
                <b>Top channel:</b> {top.channel} with {top.sessions.toLocaleString()} sessions (
                {topShare}% of total)
              </li>
            )}
            {prevRows.length > 0 && (
              <>
                <li style={{ marginTop: 6 }}>
                  <b>Sessions vs previous:</b>{" "}
                  {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev{" "}
                  {prevTotals.sessions.toLocaleString()})
                </li>
                <li>
                  <b>Users vs previous:</b>{" "}
                  {formatPctDelta(totals.users, prevTotals.users)} (prev{" "}
                  {prevTotals.users.toLocaleString()})
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
                  const pct = totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                  return (
                    <tr key={r.channel}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.channel}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {r.sessions.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {r.users.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{pct}%</td>
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

      {/* Trends over time */}
      <TrendsOverTime
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      {/* Campaigns */}
      <Campaigns
       propertyId={propertyId}
       startDate={startDate}
       endDate={endDate}
       filters={appliedFilters}
     />

     <CampaignDrilldown
      propertyId={propertyId}
      startDate={startDate}
      endDate={endDate}
      filters={appliedFilters}
     />

     <CampaignsOverview
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

      {/* Landing Pages × Attribution */}
      <LandingPages
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
     />

      {/* E-commerce KPIs */}
      <EcommerceKPIs
        key={`ekpi-${dashKey}`}
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
      {result ? (
        <details style={{ marginTop: 24 }}>
          <summary>Raw GA4 JSON (debug)</summary>
          <pre
            style={{
              marginTop: 8,
              background: "#f8f8f8",
              padding: 16,
              borderRadius: 8,
              overflow: "auto",
            }}
          >
            {safeStringify(result)}
          </pre>
        </details>
      ) : null}
    </main>
  );
}

/* ============================== Reusable AI block ============================== */
function AiBlock({
  asButton = false,
  buttonLabel = "Summarise with AI",
  endpoint,
  payload,
  resetSignal, // NEW: when this changes, clear previous AI text/error
}) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Clear AI state whenever parent tells us to reset
  useEffect(() => {
    setText("");
    setError("");
    setCopied(false);
  }, [resetSignal]);

  const run = async () => {
    setLoading(true);
    setError("");
    setText("");
    setCopied(false);
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
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={run} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading}>
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
function SourceMedium({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
  // Clear previous data/errors whenever a new report runs
  setRows([]);
  setError("");
}, [resetSignal]);

  const load = async () => {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await fetchJson("/api/ga4/source-medium", {
        propertyId,
        startDate,
        endDate,
        filters,
        limit: 25,
      });
      const parsed = (data.rows || []).map((r, i) => ({
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
          endpoint="/api/insights/summarise-source-medium"
          payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
        />
        <button
          onClick={() =>
            downloadCsvGeneric(`source_medium_${startDate}_to_${endDate}`, rows, [
              { header: "Source", key: "source" },
              { header: "Medium", key: "medium" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
            ])
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.users.toLocaleString()}
                  </td>
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

/* ============================== Campaigns ============================== */
function Campaigns({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/campaigns", {
        propertyId, startDate, endDate, filters, limit: 50,
      });
      const parsed = (data.rows || []).map((r, i) => ({
        campaign: r.dimensionValues?.[0]?.value || "(not set)",
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
        <h3 style={{ margin: 0 }}>Campaigns</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-campaigns"
          payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
        />
        <button
          onClick={() =>
            downloadCsvGeneric(
              `campaigns_${startDate}_to_${endDate}`,
              rows,
              [
                { header: "Campaign", key: "campaign" },
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
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Campaign</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.campaign}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.campaign}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
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
function TopPages({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
useEffect(() => {
  setRows([]);
  setError("");
}, [resetSignal]);

  const load = async () => {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await fetchJson("/api/ga4/top-pages", {
        propertyId,
        startDate,
        endDate,
        filters,
        limit: 20,
      });
      const parsed = (data.rows || []).map((r, i) => ({
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
          endpoint="/api/insights/summarise-pages"
          payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
        />
        <button
          onClick={() =>
            downloadCsvGeneric(`top_pages_${startDate}_to_${endDate}`, rows, [
              { header: "Title", key: "title" },
              { header: "Path", key: "path" },
              { header: "Views", key: "views" },
              { header: "Users", key: "users" },
            ])
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.views.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.users.toLocaleString()}
                  </td>
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

/* ============================== Landing Pages × Attribution ============================== */
function LandingPages({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  // New local UI controls (client-side)
  const [topOnly, setTopOnly] = useState(false);
  const [minSessions, setMinSessions] = useState(0);

  // Load from API (unchanged, still respects global filters)
  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/landing-pages", {
        propertyId, startDate, endDate, filters, limit: 500, // grab plenty; we’ll trim client-side
      });

      const parsed = (data?.rows || []).map((r, i) => ({
        landing: r.dimensionValues?.[0]?.value || "(unknown)",
        source:  r.dimensionValues?.[1]?.value || "(unknown)",
        medium:  r.dimensionValues?.[2]?.value || "(unknown)",
        sessions:      Number(r.metricValues?.[0]?.value || 0),
        users:         Number(r.metricValues?.[1]?.value || 0),
        transactions:  Number(r.metricValues?.[2]?.value || 0),
        revenue:       Number(r.metricValues?.[3]?.value || 0),
        _k: `${i}-${r.dimensionValues?.[0]?.value || ""}-${r.dimensionValues?.[1]?.value || ""}-${r.dimensionValues?.[2]?.value || ""}`,
      }));

      setRows(parsed);
      // whenever we load new data, reset client filters to sensible defaults
      setTopOnly(false);
      setMinSessions(0);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Compute slider bounds and filtered view
  const maxSessions = useMemo(() => rows.reduce((m, r) => Math.max(m, r.sessions || 0), 0), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (minSessions > 0) out = out.filter(r => (r.sessions || 0) >= minSessions);
    // keep order by sessions desc (server already sends this, but we ensure it)
    out = [...out].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
    if (topOnly) out = out.slice(0, 25); // show top N only
    return out;
  }, [rows, minSessions, topOnly]);

  const shownCount = filtered.length;
  const totalCount = rows.length;

  // CSV & AI export use the *filtered* rows so users get what they see
  const exportCsv = () => {
    downloadCsvGeneric(
      `landing_pages_${startDate}_to_${endDate}`,
      filtered,
      [
        { header: "Landing Page", key: "landing" },
        { header: "Source",       key: "source" },
        { header: "Medium",       key: "medium" },
        { header: "Sessions",     key: "sessions" },
        { header: "Users",        key: "users" },
        { header: "Transactions", key: "transactions" },
        { header: "Revenue",      key: "revenue" },
      ]
    );
  };

  return (
    <section style={{ marginTop: 28 }}>
      {/* Header + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Landing Pages × Attribution</h3>

        <button
          onClick={load}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !propertyId}
        >
          {loading ? "Loading…" : "Load Landing Pages"}
        </button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "landing-pages",
            dateRange: { start: startDate, end: endDate },
            filters,
            rows: filtered.slice(0, 50).map(r => ({
              landing: r.landing,
              source: r.source,
              medium: r.medium,
              sessions: r.sessions,
              users: r.users,
              transactions: r.transactions,
              revenue: r.revenue,
            })),
            instructions:
              "Focus on landing pages with high sessions but low transactions/revenue. Identify source/medium mixes that underperform. Provide at least 2 clear hypotheses + tests to improve CR and AOV.",
          }}
        />

        <button
          onClick={exportCsv}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!filtered.length}
        >
          Download CSV
        </button>
      </div>

      {/* Client-side view controls */}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={topOnly}
            onChange={(e) => setTopOnly(e.target.checked)}
          />
          Top entries only (25)
        </label>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 260 }}>
          <span style={{ fontSize: 13, color: "#333" }}>Min sessions</span>
          <input
            type="range"
            min={0}
            max={Math.max(10, maxSessions)}
            step={1}
            value={Math.min(minSessions, Math.max(10, maxSessions))}
            onChange={(e) => setMinSessions(Number(e.target.value))}
            style={{ width: 160 }}
            disabled={!rows.length}
          />
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "right" }}>
            {minSessions}
          </span>
        </div>

        {rows.length > 0 && (
          <span style={{ fontSize: 12, color: "#555" }}>
            Showing <b>{shownCount.toLocaleString()}</b> of {totalCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Errors / table / empty */}
      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {filtered.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Landing Page</th>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._k}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.landing}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.source}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.medium}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.transactions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>{rows.length ? "No rows match your view filters." : "No rows loaded yet."}</p>
      )}
    </section>
  );
}

/* ============================== E-commerce KPIs ============================== */
function EcommerceKPIs({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
  setTotals(null);
  setError("");
}, [resetSignal]);

  const load = async () => {
    setLoading(true);
    setError("");
    setTotals(null);
    try {
      const data = await fetchJson("/api/ga4/ecommerce-summary", {
        propertyId,
        startDate,
        endDate,
        filters,
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
          endpoint="/api/insights/summarise-ecom"
          payload={{ totals, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
        />
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}
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
              <Tr
                label="Revenue"
                value={new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(totals.revenue || 0)}
              />
              <Tr
                label="Conversion Rate (purchase / session)"
                value={`${(totals.cvr || 0).toFixed(2)}%`}
              />
              <Tr
                label="AOV (Revenue / Transactions)"
                value={new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(totals.aov || 0)}
              />
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
    typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value;
  return (
    <tr>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
        {formatted}
      </td>
    </tr>
  );
}

/* ============================== Checkout Funnel ============================== */
function CheckoutFunnel({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
  setSteps(null);
  setError("");
}, [resetSignal]);

  const load = async () => {
    setLoading(true);
    setError("");
    setSteps(null);
    try {
      const data = await fetchJson("/api/ga4/checkout-funnel", {
        propertyId,
        startDate,
        endDate,
        filters,
      });
      setSteps(data?.steps || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

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
          endpoint="/api/insights/summarise-funnel"
          payload={{ steps, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
        />
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {(val || 0).toLocaleString()}
                  </td>
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

/* ============================== Campaign drill-down ============================== */
function CampaignDrilldown({ propertyId, startDate, endDate, filters }) {
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const [totals, setTotals] = useState(null);
  const [srcMed, setSrcMed] = useState([]);
  const [content, setContent] = useState([]);
  const [term, setTerm] = useState([]);

  const load = async () => {
    setLoading(true); setError("");
    setTotals(null); setSrcMed([]); setContent([]); setTerm([]);
    try {
      const data = await fetchJson("/api/ga4/campaign-detail", {
        propertyId, startDate, endDate, filters, campaign, limit: 25,
      });

      const t = data?.totals?.rows?.[0]?.metricValues || [];
      const totalsParsed = {
        sessions: Number(t?.[0]?.value || 0),
        users: Number(t?.[1]?.value || 0),
        transactions: Number(t?.[2]?.value || 0),
        revenue: Number(t?.[3]?.value || 0),
      };
      setTotals(totalsParsed);

      const parseRows = (rows) => (rows || []).map((r, i) => ({
        d1: r.dimensionValues?.[0]?.value || "",
        d2: r.dimensionValues?.[1]?.value || "",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        transactions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
        key: `r-${i}`,
      }));

      setSrcMed(parseRows(data?.sourceMedium?.rows));
      setContent((data?.adContent?.rows || []).map((r, i) => ({
        content: r.dimensionValues?.[0]?.value || "(not set)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        transactions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
        key: `c-${i}`,
      })));
      setTerm((data?.term?.rows || []).map((r, i) => ({
        term: r.dimensionValues?.[0]?.value || "(not set)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        transactions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
        key: `t-${i}`,
      })));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cvr = totals && totals.sessions > 0 ? (totals.transactions / totals.sessions) * 100 : 0;
  const aov = totals && totals.transactions > 0 ? (totals.revenue / totals.transactions) : 0;

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Campaign drill-down</h3>

        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="Type exact campaign name…"
          style={{ padding: 8, minWidth: 260 }}
        />
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId || !campaign}>
          {loading ? "Loading…" : "Load Campaign Details"}
        </button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            kind: "campaign-detail",
            campaign,
            totals,
            breakdowns: {
              sourceMedium: srcMed,
              adContent: content,
              term,
            },
            dateRange: { start: startDate, end: endDate },
            filters,
          }}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12 }}>
          <b>Totals for “{campaign}”:</b>{" "}
          Sessions {totals.sessions.toLocaleString()} · Users {totals.users.toLocaleString()} ·
          Transactions {totals.transactions.toLocaleString()} · Revenue{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} ·
          CVR {(cvr || 0).toFixed(2)}% · AOV{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov || 0)}
        </div>
      )}

      {/* Source / Medium table */}
      {srcMed.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Source / Medium</h4>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {srcMed.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.d1 || "(not set)"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.d2 || "(not set)"}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.transactions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ad Content table */}
      {content.length > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Ad Content (utm_content)</h4>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Ad Content</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {content.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.content}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.transactions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Term table */}
      {term.length > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Term (utm_term)</h4>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Term</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {term.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.term}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.transactions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && !loading && !totals && (
        <p style={{ marginTop: 8, color: "#666" }}>Enter a campaign name and click “Load Campaign Details”.</p>
      )}
    </section>
  );
}

/* ============================== Campaigns Overview ============================== */
function CampaignsOverview({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState([]);
  const [error, setError]       = useState("");
  const [q, setQ]               = useState(""); // client-side search

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      // Reuse your existing campaigns list endpoint.
      // If your endpoint is named differently, just change the URL below.
      const data = await fetchJson("/api/ga4/campaigns", {
        propertyId, startDate, endDate, filters, limit: 100,
      });

      const parsed = (data.rows || []).map((r, i) => {
        const name          = r.dimensionValues?.[0]?.value ?? "(not set)";            // sessionCampaignName
        const sessions      = Number(r.metricValues?.[0]?.value || 0);                 // sessions
        const users         = Number(r.metricValues?.[1]?.value || 0);                 // totalUsers
        const transactions  = Number(r.metricValues?.[2]?.value || 0);                 // transactions
        const revenue       = Number(r.metricValues?.[3]?.value || 0);                 // totalRevenue
        const cvr           = sessions > 0 ? (transactions / sessions) * 100 : 0;
        const aov           = transactions > 0 ? revenue / transactions : 0;

        return {
          key: `c-${i}`,
          name, sessions, users, transactions, revenue, cvr, aov,
        };
      });

      // Sort by revenue desc as default
      parsed.sort((a, b) => b.revenue - a.revenue);

      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // simple client-side filter by campaign name
  const visible = q
    ? rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Campaigns (overview)</h3>

        <button
          onClick={load}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !propertyId}
        >
          {loading ? "Loading…" : "Load Campaigns"}
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search campaign name…"
          style={{ padding: 8, minWidth: 220 }}
        />

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            kind: "campaigns-overview",
            campaigns: visible,
            dateRange: { start: startDate, end: endDate },
            filters,
          }}
        />

        <button
          onClick={() =>
            downloadCsvGeneric(
              `campaigns_${startDate}_to_${endDate}`,
              visible.map(r => ({
                name: r.name,
                sessions: r.sessions,
                users: r.users,
                transactions: r.transactions,
                revenue: r.revenue,
                cvr: `${r.cvr.toFixed(2)}%`,
                aov: r.aov,
              })),
              [
                { header: "Campaign",      key: "name" },
                { header: "Sessions",      key: "sessions" },
                { header: "Users",         key: "users" },
                { header: "Transactions",  key: "transactions" },
                { header: "Revenue",       key: "revenue" },
                { header: "CVR (%)",       key: "cvr" },
                { header: "AOV",           key: "aov" },
              ]
            )
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!visible.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {visible.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Campaign</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>CVR</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>AOV</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.users.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.transactions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.cvr.toFixed(2)}%
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.aov || 0)}
                  </td>
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

/* ============================== Trends Over Time ============================== */
function TrendsOverTime({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState("daily"); // "daily" | "weekly"
  const [rows, setRows] = useState([]); // [{ period, sessions, users, transactions, revenue }]
  const [error, setError] = useState("");

// --- Label formatting helpers ---
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function pad2(n) { return String(n).padStart(2, "0"); }

// Get the Monday of an ISO week
function isoWeekStartUTC(year, week) {
  // Start from Jan 4th (always in ISO week 1), then step to the requested week
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const mondayTarget = new Date(mondayWeek1);
  mondayTarget.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return mondayTarget;
}

// 202435 or 2024W35 -> "06–12 Sep 2024" (week date range)
function formatYearWeekRange(s) {
  const m = /^(\d{4})W?(\d{2})$/.exec(String(s) || "");
  if (!m) return String(s || "");
  const year = Number(m[1]);
  const week = Number(m[2]);

  const start = isoWeekStartUTC(year, week);           // Monday
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6); // Sunday

  const startStr = `${pad2(start.getUTCDate())} ${MONTHS[start.getUTCMonth()]}`;
  const endStr   = `${pad2(end.getUTCDate())} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;

  // Compact, readable axis label:
  return `${startStr}–${endStr}`;
}

// Already in your code; keep as-is
function formatYYYYMMDD(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s) || "");
  if (!m) return String(s || "");
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return `${String(d).padStart(2, "0")} ${MONTHS[mo - 1]} ${y}`;
}

// Use the new weekly formatter here:
function displayPeriodLabel(raw, gran) {
  return gran === "weekly" ? formatYearWeekRange(raw) : formatYYYYMMDD(raw);
}

  // small helper for a QuickChart line chart
  function buildLineChartUrl(series) {
    if (!series?.length) return "";
    const labels = series.map((d) => displayPeriodLabel(d.period, granularity));
    const sessions = series.map((d) => d.sessions);
    const users = series.map((d) => d.users);

    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Sessions", data: sessions },
          { label: "Users", data: users },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true } },
      },
    };
    return `https://quickchart.io/chart?w=800&h=360&c=${encodeURIComponent(JSON.stringify(cfg))}`;
  }

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/timeseries", {
        propertyId, startDate, endDate, filters, granularity,
      });
      setRows(data?.series || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const hasRows = rows.length > 0;

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Trends over time</h3>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Granularity
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            style={{ padding: 6 }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <button
          onClick={load}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !propertyId}
          title={!propertyId ? "Enter a GA4 property ID first" : ""}
        >
          {loading ? "Loading…" : "Load Trends"}
        </button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            kind: "timeseries",
            granularity,
            series: rows,
            dateRange: { start: startDate, end: endDate },
            filters,
            goals: [
              "Call out surges/drops and likely drivers",
              "Flag seasonality or anomalies",
              "Recommend 2–3 next actions or tests",
            ],
          }}
        />

        <button
          onClick={() =>
            downloadCsvGeneric(
              `timeseries_${granularity}_${startDate}_to_${endDate}`,
              rows,
              [
                { header: "Period", key: "period" },
                { header: "Sessions", key: "sessions" },
                { header: "Users", key: "users" },
                { header: "Transactions", key: "transactions" },
                { header: "Revenue", key: "revenue" },
              ]
            )
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!hasRows}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {hasRows ? (
        <>
          {/* Chart */}
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows)}
              alt="Sessions & Users trend"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>

          {/* Table */}
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Period</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Users</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Transactions</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = displayPeriodLabel(r.period, granularity);
                  return (
                    <tr key={r.period} title={r.period}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {r.sessions.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {r.users.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {r.transactions.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </section>
  );
}