/* eslint-disable @next/next/no-img-element */

// pages/index.js
import { useEffect, useMemo, useState } from "react";

/* ============================== Constants & Helpers ============================== */

/** -------- Saved Views (URL helpers) -------- */
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

/** -------- Required storage keys (do not change) -------- */
const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";
const KPI_TARGETS_KEY = "insightgpt_kpi_targets_v1";
const ALERTS_CFG_KEY = "insightgpt_alerts_cfg_v1";

/** -------- KPI Targets helpers & badge --------
 * Expected (in localStorage):
 *   {
 *     sessionsTarget: number,
 *     revenueTarget: number,
 *     cvrTarget: number
 *   }
 */
function loadKpiTargets() {
  try {
    const raw = localStorage.getItem(KPI_TARGETS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveKpiTargets(next) {
  try {
    localStorage.setItem(KPI_TARGETS_KEY, JSON.stringify(next || {}));
  } catch {}
}
function pctToTarget(current, target) {
  if (!target || target <= 0) return null;
  return Math.round((current / target) * 100);
}
function TargetBadge({ label, current, target, currency = false }) {
  if (target == null || Number.isNaN(Number(target))) return null;
  const pct = pctToTarget(Number(current || 0), Number(target));
  if (pct == null) return null;
  const ok = pct >= 100;
  const val = currency
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(target) || 0)
    : Number(target).toLocaleString();
  return (
    <span
      title={`${label} target: ${val} • Progress: ${pct}%`}
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: ok ? "#e6f4ea" : "#fdecea",
        color: ok ? "#137333" : "#b00020",
        border: `1px solid ${ok ? "#b7e1cd" : "#f4c7c3"}`
      }}
      aria-label={`${pct}% to ${label} target`}
    >
      {`${pct}% to ${label} target`}
    </span>
  );
}

/** -------- Alerts config helpers --------
 * Expected (in localStorage):
 * {
 *   enabled: boolean,
 *   channels: { sessions: boolean, revenue: boolean, cvr: boolean },
 *   sensitivity: number,     // z-score threshold (e.g., 2.0)
 *   lookbackDays: number,    // e.g., 28
 *   notifyInApp: boolean
 * }
 */
function loadAlertsCfg() {
  try {
    const raw = localStorage.getItem(ALERTS_CFG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveAlertsCfg(cfg) {
  try {
    localStorage.setItem(ALERTS_CFG_KEY, JSON.stringify(cfg || {}));
  } catch {}
}

/** -------- Select options -------- */
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

/** -------- Utilities -------- */
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

/** QuickChart line chart URL */
function buildLineChartUrl(series, granularity) {
  if (!series?.length) return "";
  const labels = series.map((d) => displayPeriodLabel(d.period, granularity));
  const sessions = series.map((d) => d.sessions);
  const users = series.map((d) => d.users);
  const cfg = {
    type: "line",
    data: { labels, datasets: [{ label: "Sessions", data: sessions }, { label: "Users", data: users }] },
    options: { plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } },
  };
  return `https://quickchart.io/chart?w=800&h=360&c=${encodeURIComponent(JSON.stringify(cfg))}`;
}

/** Unified fetch helper */
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

/** Date label helpers used by timeseries & alerts */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function pad2(n) { return String(n).padStart(2, "0"); }
function isoWeekStartUTC(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const mondayTarget = new Date(mondayWeek1);
  mondayTarget.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return mondayTarget;
}
function formatYearWeekRange(s) {
  const m = /^(\d{4})W?(\d{2})$/.exec(String(s) || "");
  if (!m) return String(s || "");
  const year = Number(m[1]); const week = Number(m[2]);
  const start = isoWeekStartUTC(year, week);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const startStr = `${pad2(start.getUTCDate())} ${MONTHS[start.getUTCMonth()]}`;
  const endStr = `${pad2(end.getUTCDate())} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  return `${startStr}–${endStr}`;
}
function formatYYYYMMDD(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s) || "");
  if (!m) return String(s || "");
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return `${String(d).padStart(2, "0")} ${MONTHS[mo - 1]} ${y}`;
}
function displayPeriodLabel(raw, gran) {
  return gran === "weekly" ? formatYearWeekRange(raw) : formatYYYYMMDD(raw);
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

  // Load from URL once
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const q = decodeQuery();
      if (!q) return;

      if (q.startDate) setStartDate(q.startDate);
      if (q.endDate) setEndDate(q.endDate);

      setCountrySel(q.country || "All");
      setChannelSel(q.channelGroup || "All");
      setAppliedFilters({
        country: q.country || "All",
        channelGroup: q.channelGroup || "All",
      });

      setComparePrev(!!q.comparePrev);
    } catch {}
  }, []);

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

  const channelsParsed = useMemo(() => parseGa4Channels(result), [result]);
  const rows = channelsParsed.rows;
  const totals = channelsParsed.totals;

  const prevParsed = useMemo(() => parseGa4Channels(prevResult), [prevResult]);
  const prevRows = prevParsed.rows;
  const prevTotals = prevParsed.totals;

  const top = rows[0];
  const topShare = top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

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

      // Broadcast reset for sections & AI
      setRefreshSignal((n) => n + 1);

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

  // Reset Dashboard: keep propertyId, reset everything else
  const resetDashboard = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setStartDate("2024-09-01");
    setEndDate("2024-09-30");
    setCountrySel("All");
    setChannelSel("All");
    setAppliedFilters({ country: "All", channelGroup: "All" });
    setComparePrev(false);
    setResult(null);
    setPrevResult(null);
    setError("");
    setDashKey((k) => k + 1); // force remount of sections
    try {
      const path = window.location.pathname;
      window.history.replaceState(null, "", path);
    } catch {}
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Connect GA4, choose a date range, optionally apply filters, and view traffic &amp; insights.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }} aria-label="Connect Google Analytics">
          Connect Google Analytics
        </button>

        <label htmlFor="property-id">GA4 Property ID&nbsp;
          <input
            id="property-id"
            name="property-id"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            style={{ padding: 8, minWidth: 180 }}
          />
        </label>

        <label htmlFor="start-date">Start date&nbsp;
          <input id="start-date" name="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: 8 }} />
        </label>
        <label htmlFor="end-date">End date&nbsp;
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
          <label htmlFor="country-filter">Country&nbsp;
            <select id="country-filter" value={countrySel} onChange={(e) => setCountrySel(e.target.value)} style={{ padding: 8 }}>
              {COUNTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label htmlFor="channel-filter">Channel Group&nbsp;
            <select id="channel-filter" value={channelSel} onChange={(e) => setChannelSel(e.target.value)} style={{ padding: 8 }}>
              {CHANNEL_GROUP_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <button onClick={applyFilters} style={{ padding: "8px 12px", cursor: "pointer" }}>Apply filters</button>
          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span style={{ background: "#e6f4ea", color: "#137333", padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
              {`Filters active: `}
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

      {/* KPI Targets Panel (always visible; persists to insightgpt_kpi_targets_v1) */}
      <KpiTargetsPanel />

      {/* Saved Views */}
      <SavedViews
        startDate={startDate}
        endDate={endDate}
        countrySel={countrySel}
        channelSel={channelSel}
        comparePrev={comparePrev}
        onApply={(view) => {
          setStartDate(view.startDate);
          setEndDate(view.endDate);
          setCountrySel(view.country || "All");
          setChannelSel(view.channelGroup || "All");
          setComparePrev(!!view.comparePrev);
          setAppliedFilters({
            country: view.country || "All",
            channelGroup: view.channelGroup || "All",
          });
        }}
        onRunReport={runReport}
      />

      {error && <p style={{ color: "crimson", marginTop: 16 }}>Error: {error}</p>}

      {/* At a glance + Channels */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24, background: "#f6f7f8", padding: 16, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Traffic by Default Channel Group</h2>
            {/* KPI badge for Sessions (hero) */}
            <TargetBadge
              label="Sessions"
              current={Number(totals?.sessions || 0)}
              target={Number(loadKpiTargets()?.sessionsTarget)}
            />
            <AiBlock
              asButton
              buttonLabel="Summarise with AI"
              endpoint="/api/insights/summarise"
              payload={{ rows, totals, dateRange: { start: startDate, end: endDate }, filters: appliedFilters }}
              resetSignal={refreshSignal}
            />
          </div>

          <ul style={{ marginTop: 12 }}>
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
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16 }}>
            {/* Using <img> with ESLint disabled at file top to avoid extra next/image config for remote charts */}
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>
        </section>
      )}

      {/* Premium: Anomaly Alerts (Sessions / Revenue / CVR) */}
      <AnomalyAlerts
        key={`alerts-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* Source / Medium */}
      <SourceMedium
        key={`sm-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
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

      {/* Campaign drill-down */}
      <CampaignDrilldown
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      {/* Campaigns Overview */}
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
        resetSignal={refreshSignal}
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
        resetSignal={refreshSignal}
      />

      {/* Checkout funnel */}
      <CheckoutFunnel
        key={`cf-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {process.env.NEXT_PUBLIC_ENABLE_PRODUCTS === "true" && (
        <Products
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          resetSignal={refreshSignal}
        />
      )}

      {/* Raw JSON (debug) */}
      {result ? (
        <details style={{ marginTop: 24 }}>
          <summary>Raw GA4 JSON (debug)</summary>
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 16, borderRadius: 8, overflow: "auto" }}>
{safeStringify(result)}
          </pre>
        </details>
      ) : null}
    </main>
  );
}

/* ============================== KPI Targets Panel ============================== */
function KpiTargetsPanel() {
  const [targets, setTargets] = useState({ sessionsTarget: "", revenueTarget: "", cvrTarget: "" });
  const [savedNote, setSavedNote] = useState("");

  useEffect(() => {
    try {
      const existing = loadKpiTargets();
      setTargets({
        sessionsTarget: existing.sessionsTarget ?? "",
        revenueTarget: existing.revenueTarget ?? "",
        cvrTarget: existing.cvrTarget ?? "",
      });
    } catch {}
  }, []);

  const save = () => {
    const out = {
      sessionsTarget: Number(targets.sessionsTarget) || 0,
      revenueTarget: Number(targets.revenueTarget) || 0,
      cvrTarget: Number(targets.cvrTarget) || 0,
    };
    saveKpiTargets(out);
    setSavedNote("Saved!");
    setTimeout(() => setSavedNote(""), 1200);
  };

  return (
    <section style={{ marginTop: 12, padding: 12, border: "1px dashed #e0e0e0", borderRadius: 8, background: "#fbfbfb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>KPI Targets</h3>
        <label htmlFor="kpi-sessions" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Sessions&nbsp;
          <input
            id="kpi-sessions"
            type="number"
            inputMode="numeric"
            value={targets.sessionsTarget}
            onChange={(e) => setTargets((t) => ({ ...t, sessionsTarget: e.target.value }))}
            style={{ padding: 6, width: 140 }}
            placeholder="e.g. 50000"
          />
        </label>
        <label htmlFor="kpi-revenue" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Revenue (GBP)&nbsp;
          <input
            id="kpi-revenue"
            type="number"
            inputMode="numeric"
            step="0.01"
            value={targets.revenueTarget}
            onChange={(e) => setTargets((t) => ({ ...t, revenueTarget: e.target.value }))}
            style={{ padding: 6, width: 160 }}
            placeholder="e.g. 250000"
          />
        </label>
        <label htmlFor="kpi-cvr" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          CVR %&nbsp;
          <input
            id="kpi-cvr"
            type="number"
            inputMode="numeric"
            step="0.01"
            value={targets.cvrTarget}
            onChange={(e) => setTargets((t) => ({ ...t, cvrTarget: e.target.value }))}
            style={{ padding: 6, width: 120 }}
            placeholder="e.g. 2.5"
          />
        </label>
        <button onClick={save} style={{ padding: "8px 12px", cursor: "pointer" }} aria-label="Save KPI Targets">
          Save targets
        </button>
        {savedNote && <span style={{ color: "#137333", fontSize: 12 }}>{savedNote}</span>}
        <span style={{ color: "#666", fontSize: 12 }}>
          These targets drive progress badges across the dashboard.
        </span>
      </div>
    </section>
  );
}

/* ============================== Anomaly Alerts (Premium) ============================== */
function AnomalyAlerts({ propertyId, startDate, endDate, filters, resetSignal }) {
  // Config state
  const [cfg, setCfg] = useState({
    enabled: false,
    channels: { sessions: true, revenue: true, cvr: true },
    sensitivity: 2.0,
    lookbackDays: 28,
    notifyInApp: true,
  });
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState("daily"); // daily only for alerts
  const [series, setSeries] = useState([]); // [{ period, sessions, users, transactions, revenue }]
  const [alerts, setAlerts] = useState([]); // derived anomalies
  const [error, setError] = useState("");

  // Reset on dashboard reset/run
  useEffect(() => {
    setSeries([]);
    setAlerts([]);
    setError("");
  }, [resetSignal]);

  // Load existing cfg
  useEffect(() => {
    const stored = loadAlertsCfg();
    if (stored && typeof stored === "object") {
      setCfg((c) => ({
        enabled: !!stored.enabled,
        channels: {
          sessions: !!stored?.channels?.sessions,
          revenue: !!stored?.channels?.revenue,
          cvr: !!stored?.channels?.cvr,
        },
        sensitivity: Number(stored.sensitivity || 2.0),
        lookbackDays: Math.max(7, Number(stored.lookbackDays || 28)),
        notifyInApp: stored.notifyInApp !== false,
      }));
    }
  }, []);

  const persistCfg = (next) => {
    setCfg(next);
    saveAlertsCfg(next);
  };

  // Fetch timeseries for anomaly detection
  const loadSeries = async () => {
    if (!propertyId) { setError("Enter a GA4 property ID first."); return; }
    setLoading(true); setError(""); setSeries([]); setAlerts([]);
    try {
      const data = await fetchJson("/api/ga4/timeseries", { propertyId, startDate, endDate, filters, granularity: "daily" });
      const s = Array.isArray(data?.series) ? data.series : [];
      setSeries(s);
      setAlerts(detectAnomalies(s, cfg));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Simple anomaly detection using rolling mean/std (excluding the point)
  function detectAnomalies(s, config) {
    if (!Array.isArray(s) || s.length === 0) return [];
    const lookback = Math.max(7, Number(config.lookbackDays || 28));
    const z = Math.max(1.0, Number(config.sensitivity || 2.0));

    const pts = s.map((d) => {
      const sess = Number(d.sessions || 0);
      const rev = Number(d.revenue || 0);
      const tx = Number(d.transactions || 0);
      const cvr = (Number(d.sessions || 0) > 0 && Number(d.transactions || 0) >= 0)
        ? (tx / sess) * 100
        : 0;
      return { period: d.period, sessions: sess, revenue: rev, transactions: tx, cvr };
    });

    const metrics = [
      config.channels.sessions ? "sessions" : null,
      config.channels.revenue ? "revenue" : null,
      config.channels.cvr ? "cvr" : null,
    ].filter(Boolean);

    const out = [];

    for (let i = 0; i < pts.length; i++) {
      for (const m of metrics) {
        const start = Math.max(0, i - lookback);
        const window = pts.slice(start, i).map((x) => Number(x[m] || 0)).filter((n) => Number.isFinite(n));
        if (window.length < 7) continue; // need enough history

        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
        const std = Math.sqrt(variance);
        const val = Number(pts[i][m] || 0);

        let isAnom = false;
        let direction = "neutral";
        if (std === 0) {
          // If std is zero, treat any non-equal value as anomaly
          isAnom = Math.abs(val - mean) > 0;
          direction = val > mean ? "high" : "low";
        } else {
          const zScore = (val - mean) / std;
          isAnom = Math.abs(zScore) >= z;
          direction = zScore > 0 ? "high" : "low";
        }

        if (isAnom) {
          out.push({
            period: pts[i].period,
            metric: m,
            value: val,
            baseline: Number.isFinite(mean) ? mean : 0,
            std,
            direction,
          });
        }
      }
    }

    // Sort newest first (if periods are sortable strings like YYYYMMDD)
    out.sort((a, b) => String(b.period).localeCompare(String(a.period)));
    return out;
  }

  const kpiTargets = loadKpiTargets(); // for contextual info in the panel

  return (
    <section style={{ marginTop: 28, padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Anomaly Alerts (Premium)</h3>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => persistCfg({ ...cfg, enabled: e.target.checked })}
          />
          Enable alerts
        </label>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Sensitivity (z)
            <input
              type="number"
              step="0.1"
              min={1}
              value={cfg.sensitivity}
              onChange={(e) => persistCfg({ ...cfg, sensitivity: Number(e.target.value || 2.0) })}
              style={{ width: 70, padding: 6 }}
            />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Lookback (days)
            <input
              type="number"
              min={7}
              value={cfg.lookbackDays}
              onChange={(e) => persistCfg({ ...cfg, lookbackDays: Math.max(7, Number(e.target.value || 28)) })}
              style={{ width: 90, padding: 6 }}
            />
          </label>
        </div>

        <div role="group" aria-label="Metrics to monitor" style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={cfg.channels.sessions}
              onChange={(e) => persistCfg({ ...cfg, channels: { ...cfg.channels, sessions: e.target.checked } })}
            />
            Sessions
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={cfg.channels.revenue}
              onChange={(e) => persistCfg({ ...cfg, channels: { ...cfg.channels, revenue: e.target.checked } })}
            />
            Revenue
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={cfg.channels.cvr}
              onChange={(e) => persistCfg({ ...cfg, channels: { ...cfg.channels, cvr: e.target.checked } })}
            />
            CVR
          </label>
        </div>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={cfg.notifyInApp}
            onChange={(e) => persistCfg({ ...cfg, notifyInApp: e.target.checked })}
          />
          Notify in app
        </label>

        <button
          onClick={loadSeries}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !cfg.enabled || !propertyId}
          title={!propertyId ? "Enter a GA4 property ID first" : ""}
        >
          {loading ? "Checking…" : "Run check now"}
        </button>

        {/* Context note using targets (non-blocking) */}
        <span style={{ color: "#666", fontSize: 12 }}>
          Targets: Sessions {Number(kpiTargets?.sessionsTarget || 0).toLocaleString()} · Revenue {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(kpiTargets?.revenueTarget || 0))} · CVR {(Number(kpiTargets?.cvrTarget || 0)).toFixed(2)}%
        </span>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 10, whiteSpace: "pre-wrap" }}>{error}</p>}

      {/* Alerts table */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Period</th>
              <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Metric</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Value</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Baseline</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Std Dev</th>
              <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Direction</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length > 0 ? alerts.map((a, idx) => {
              const label = displayPeriodLabel(a.period, granularity);
              const isRevenue = a.metric === "revenue";
              const valueCell = isRevenue
                ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(a.value || 0)
                : (a.metric === "cvr" ? `${(a.value || 0).toFixed(2)}%` : Number(a.value || 0).toLocaleString());

              const baseCell = isRevenue
                ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(a.baseline || 0)
                : (a.metric === "cvr" ? `${(a.baseline || 0).toFixed(2)}%` : Number(a.baseline || 0).toLocaleString());

              return (
                <tr key={`alert-${idx}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", textTransform: "uppercase" }}>{a.metric}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{valueCell}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{baseCell}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(a.std || 0).toFixed(2)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", color: a.direction === "high" ? "#137333" : "#b00020" }}>
                    {a.direction}
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={6} style={{ padding: 12, textAlign: "center", color: "#666" }}>
                  {cfg.enabled ? "No anomalies detected yet. Click \"Run check now\" after loading a timeseries." : "Enable alerts and run a check to see anomalies here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================== Reusable AI block ============================== */
function AiBlock({ asButton = false, buttonLabel = "Summarise with AI", endpoint, payload, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText("");
    setError("");
    setCopied(false);
  }, [resetSignal]);

  const run = async () => {
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

  useEffect(() => { setRows([]); setError(""); }, [resetSignal]);

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/source-medium", {
        propertyId, startDate, endDate, filters, limit: 25,
      });
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

  // Totals + KPI badges
  const totalSessions = useMemo(
    () => rows.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [rows]
  );
  const kpiTargets = loadKpiTargets(); // compute on render; it is cheap

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source / Medium"}
        </button>
        {rows.length > 0 && (
          <TargetBadge
            label="Sessions"
            current={totalSessions}
            target={Number(kpiTargets?.sessionsTarget)}
          />
        )}
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-source-medium"
          payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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

/* ============================== Campaigns (overview) ============================== */
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

  const totalSessions = useMemo(
    () => rows.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [rows]
  );
  const kpiTargets = loadKpiTargets();

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Campaigns</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>
        {rows.length > 0 && (
          <TargetBadge
            label="Sessions"
            current={totalSessions}
            target={Number(kpiTargets?.sessionsTarget)}
          />
        )}
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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
          aria-label="Campaign name"
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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
        <p style={{ marginTop: 8, color: "#666" }}>Enter a campaign name and click {"\""}Load Campaign Details{"\""}.</p>
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
      const data = await fetchJson("/api/ga4/campaigns", {
        propertyId, startDate, endDate, filters, limit: 100,
      });

      const parsed = (data.rows || []).map((r, i) => {
        const name          = r.dimensionValues?.[0]?.value ?? "(not set)";
        const sessions      = Number(r.metricValues?.[0]?.value || 0);
        const users         = Number(r.metricValues?.[1]?.value || 0);
        const transactions  = Number(r.metricValues?.[2]?.value || 0);
        const revenue       = Number(r.metricValues?.[3]?.value || 0);
        const cvr           = sessions > 0 ? (transactions / sessions) * 100 : 0;
        const aov           = transactions > 0 ? revenue / transactions : 0;

        return { key: `c-${i}`, name, sessions, users, transactions, revenue, cvr, aov };
      });

      parsed.sort((a, b) => b.revenue - a.revenue);
      setRows(parsed);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const visible = q ? rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

  const totalSessions = useMemo(
    () => visible.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [visible]
  );
  const kpiTargets = loadKpiTargets();

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Campaigns (overview)</h3>

        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign name…" style={{ padding: 8, minWidth: 220 }} aria-label="Search campaign name" />

        {visible.length > 0 && (
          <TargetBadge
            label="Sessions"
            current={totalSessions}
            target={Number(kpiTargets?.sessionsTarget)}
          />
        )}

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ kind: "campaigns-overview", campaigns: visible, dateRange: { start: startDate, end: endDate }, filters }}
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
                { header: "Campaign", key: "name" },
                { header: "Sessions", key: "sessions" },
                { header: "Users", key: "users" },
                { header: "Transactions", key: "transactions" },
                { header: "Revenue", key: "revenue" },
                { header: "CVR (%)", key: "cvr" },
                { header: "AOV", key: "aov" },
              ]
            )
          }
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!visible.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.transactions.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.cvr.toFixed(2)}%</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.aov || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* ============================== Top Pages ============================== */
function TopPages({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => { setRows([]); setError(""); }, [resetSignal]);

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/top-pages", { propertyId, startDate, endDate, filters, limit: 20 });
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* ============================== Landing Pages × Attribution ============================== */
function LandingPages({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [topOnly, setTopOnly] = useState(false);
  const [minSessions, setMinSessions] = useState(0);

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/landing-pages", {
        propertyId, startDate, endDate, filters, limit: 500,
      });

      const parsed = (data?.rows || []).map((r, i) => ({
        landing: r.dimensionValues?.[0]?.value || "(unknown)",
        source:  r.dimensionValues?.[1]?.value || "(unknown)",
        medium:  r.dimensionValues?.[2]?.value || "(unknown)",
        sessions:     Number(r.metricValues?.[0]?.value || 0),
        users:        Number(r.metricValues?.[1]?.value || 0),
        transactions: Number(r.metricValues?.[2]?.value || 0),
        revenue:      Number(r.metricValues?.[3]?.value || 0),
        _k: `${i}-${r.dimensionValues?.[0]?.value || ""}-${r.dimensionValues?.[1]?.value || ""}-${r.dimensionValues?.[2]?.value || ""}`,
      }));

      setRows(parsed);
      setTopOnly(false);
      setMinSessions(0);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const maxSessions = useMemo(() => rows.reduce((m, r) => Math.max(m, r.sessions || 0), 0), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (minSessions > 0) out = out.filter(r => (r.sessions || 0) >= minSessions);
    out = [...out].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
    if (topOnly) out = out.slice(0, 25);
    return out;
  }, [rows, minSessions, topOnly]);

  const shownCount = filtered.length;
  const totalCount = rows.length;

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Landing Pages × Attribution</h3>

        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
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
              landing: r.landing, source: r.source, medium: r.medium,
              sessions: r.sessions, users: r.users, transactions: r.transactions, revenue: r.revenue,
            })),
            instructions:
              "Focus on landing pages with high sessions but low transactions/revenue. Identify source/medium mixes that underperform. Provide at least 2 clear hypotheses + tests to improve CR and AOV.",
          }}
        />

        <button onClick={exportCsv} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!filtered.length}>
          Download CSV
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} />
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
            aria-label="Minimum sessions filter"
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>{rows.length ? "No rows match your view filters." : "No rows loaded yet."}</p>)}
    </section>
  );
}

/* ============================== E-commerce KPIs ============================== */
function EcommerceKPIs({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setTotals(null); setError(""); }, [resetSignal]);

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

  const kpiTargets = loadKpiTargets();

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
        {/* KPI badges shown when totals loaded */}
        {totals && (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <TargetBadge
              label="Sessions"
              current={Number(totals?.sessions || 0)}
              target={Number(kpiTargets?.sessionsTarget)}
            />
            <TargetBadge
              label="Revenue"
              current={Number(totals?.revenue || 0)}
              target={Number(kpiTargets?.revenueTarget)}
              currency
            />
            <TargetBadge
              label="CVR"
              current={Number(totals?.cvr || 0)}
              target={Number(kpiTargets?.cvrTarget)}
            />
          </div>
        )}
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-ecom"
          payload={{ totals, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}
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
                value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)}
              />
              <Tr
                label="Conversion Rate (purchase / session)"
                value={`${(totals.cvr || 0).toFixed(2)}%`}
              />
              <Tr
                label="AOV (Revenue / Transactions)"
                value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.aov || 0)}
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
  const formatted = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value;
  return (
    <tr>
      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{formatted}</td>
    </tr>
  );
}

/* ============================== Checkout Funnel ============================== */
function CheckoutFunnel({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { setSteps(null); setError(""); }, [resetSignal]);

  const load = async () => {
    setLoading(true); setError(""); setSteps(null);
    try {
      const data = await fetchJson("/api/ga4/checkout-funnel", { propertyId, startDate, endDate, filters });
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{(val || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* ============================== Trends Over Time ============================== */
function TrendsOverTime({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState("daily");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError(""); setRows([]);
    try {
      const data = await fetchJson("/api/ga4/timeseries", { propertyId, startDate, endDate, filters, granularity });
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
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)} style={{ padding: 6 }} aria-label="Granularity">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</p>}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows, granularity)}
              alt="Sessions & Users trend"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>

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
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.sessions.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.users.toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.transactions.toLocaleString()}</td>
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
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* ============================== Product Performance ============================== */
function Products({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);            // [{ name, id, views, carts, purchases, revenue }]
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);        // raw GA4 response

  useEffect(() => {
    setRows([]);
    setError("");
    setDebug(null);
  }, [resetSignal]);

  function parseProductsResponse(data) {
    if (!data || !Array.isArray(data.rows)) return [];

    const dimNames = (data.dimensionHeaders || []).map(h => h.name);
    const metNames = (data.metricHeaders || []).map(h => h.name);

    const iItemName = dimNames.findIndex(n => n === "itemName");
    const iItemId   = dimNames.findIndex(n => n === "itemId");

    const iViews     = metNames.findIndex(n => n === "itemViews");
    const iCarts     = metNames.findIndex(n => n === "addToCarts");
    const iPurchQty  = metNames.findIndex(n => n === "itemPurchaseQuantity");
    const iPurchAlt1 = metNames.findIndex(n => n === "itemsPurchased");
    const iRevenue   = metNames.findIndex(n => n === "itemRevenue");

    return data.rows.map((r, idx) => {
      const name = iItemName >= 0
        ? (r.dimensionValues?.[iItemName]?.value || "(unknown)")
        : (iItemId >= 0 ? (r.dimensionValues?.[iItemId]?.value || "(unknown)") : `(row ${idx+1})`);

      const views     = iViews     >= 0 ? Number(r.metricValues?.[iViews]?.value || 0) : 0;
      const carts     = iCarts     >= 0 ? Number(r.metricValues?.[iCarts]?.value || 0) : 0;
      const purchases = iPurchQty  >= 0 ? Number(r.metricValues?.[iPurchQty]?.value || 0)
                        : iPurchAlt1 >= 0 ? Number(r.metricValues?.[iPurchAlt1]?.value || 0)
                        : 0;
      const revenue   = iRevenue   >= 0 ? Number(r.metricValues?.[iRevenue]?.value || 0) : 0;

      return {
        key: `p-${idx}`,
        name,
        id: iItemId >= 0 ? (r.dimensionValues?.[iItemId]?.value || "") : "",
        views,
        carts,
        purchases,
        revenue,
      };
    });
  }

  async function load() {
    setLoading(true); setError(""); setRows([]); setDebug(null);
    const payload = { propertyId, startDate, endDate, filters, limit: 100 };

    const tryEndpoints = async () => {
      try {
        const d1 = await fetchJson("/api/ga4/products-lite", payload);
        return { data: d1, which: "products-lite" };
      } catch {
        const d2 = await fetchJson("/api/ga4/products", payload);
        return { data: d2, which: "products" };
      }
    };

    try {
      const { data, which } = await tryEndpoints();
      setDebug({ which, headers: {
        dimensions: (data?.dimensionHeaders || []).map(h => h.name),
        metrics:    (data?.metricHeaders || []).map(h => h.name),
      }});

      const parsed = parseProductsResponse(data);
      if (!parsed.length) {
        setError("No product rows returned. Check date range, filters, and GA4 e-commerce tagging.");
      } else {
        parsed.sort((a, b) => (b.views || 0) - (a.views || 0));
        setRows(parsed);
      }
    } catch (e) {
      setError(String(e?.message || e) || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  const exportCsv = () => {
    if (!rows.length) return;
    downloadCsvGeneric(
      `product_performance_${startDate}_to_${endDate}`,
      rows.map(r => ({
        name: r.name,
        id: r.id,
        views: r.views,
        carts: r.carts,
        purchases: r.purchases,
        revenue: r.revenue,
      })),
      [
        { header: "Item name/ID", key: "name" },
        { header: "Item ID",      key: "id" },
        { header: "Items viewed", key: "views" },
        { header: "Items added to cart", key: "carts" },
        { header: "Items purchased", key: "purchases" },
        { header: "Item revenue", key: "revenue" },
      ]
    );
  };

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Product Performance</h3>
        <button
          onClick={load}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !propertyId}
          title={!propertyId ? "Enter a GA4 property ID first" : ""}
        >
          {loading ? "Loading…" : "Load Products"}
        </button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "products",
            dateRange: { start: startDate, end: endDate },
            filters,
            rows: rows.slice(0, 50).map(r => ({
              name: r.name,
              id: r.id,
              views: r.views,
              carts: r.carts,
              purchases: r.purchases,
              revenue: r.revenue,
            })),
            instructions:
              "Identify SKUs with high views but low add-to-carts or purchases. Call out likely issues (pricing, imagery, PDP UX). Provide 2–3 testable hypotheses to improve add-to-cart rate and conversion.",
          }}
          resetSignal={resetSignal}
        />

        <button
          onClick={exportCsv}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={!rows.length}
        >
          Download CSV
        </button>

        <span style={{ color: "#666", fontSize: 12 }}>
          Respects global filters (Country / Channel Group).
        </span>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Item</th>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Item ID</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items viewed</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items added to cart</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items purchased</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Item revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.id || "—"}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.views.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.carts.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{r.purchases.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}

      {debug && (
        <details style={{ marginTop: 10 }}>
          <summary>Raw products response (debug)</summary>
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 12, borderRadius: 6, overflow: "auto" }}>
{JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

/* ============================== Saved Views ============================== */
function SavedViews({
  startDate, endDate, countrySel, channelSel, comparePrev,
  onApply,
  onRunReport,
}) {
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setPresets(arr);
    } catch {}
  }, []);

  const persist = (arr) => {
    setPresets(arr);
    try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(arr)); } catch {}
  };

  const saveCurrent = () => {
    const trimmed = (name || "").trim();
    if (!trimmed) { setNotice("Give your view a name."); return; }

    const next = [...presets.filter(p => p.name !== trimmed), {
      id: crypto?.randomUUID?.() || String(Date.now()),
      name: trimmed,
      startDate,
      endDate,
      country: countrySel,
      channelGroup: channelSel,
      comparePrev: !!comparePrev,
      savedAt: new Date().toISOString(),
    }].sort((a, b) => a.name.localeCompare(b.name));

    persist(next);
    setNotice("Saved!");
    setTimeout(() => setNotice(""), 1200);
  };

  const apply = (p, run = false) => {
    onApply({
      startDate: p.startDate,
      endDate: p.endDate,
      country: p.country,
      channelGroup: p.channelGroup,
      comparePrev: !!p.comparePrev,
    });
    if (run) onRunReport();
  };

  const remove = (p) => {
    const next = presets.filter(x => x.name !== p.name);
    persist(next);
  };

  return (
    <section style={{ marginTop: 12, padding: 12, border: "1px dashed #e0e0e0", borderRadius: 8, background: "#fbfbfb" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Saved Views</h3>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view (e.g. UK · Organic · Sep)"
          style={{ padding: 8, minWidth: 260 }}
          aria-label="Saved view name"
        />
        <button onClick={saveCurrent} style={{ padding: "8px 12px", cursor: "pointer" }}>
          Save current
        </button>
        {notice && <span style={{ color: "#137333", fontSize: 12 }}>{notice}</span>}
      </div>

      {presets.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {presets.map((p) => (
            <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 280 }}>
                <b>{p.name}</b>{" "}
                <span style={{ color: "#666", fontSize: 12 }}>
                  {p.startDate} → {p.endDate} · {p.country} · {p.channelGroup} {p.comparePrev ? "· compare" : ""}
                </span>
              </div>
              <button onClick={() => apply(p, false)} style={{ padding: "6px 10px", cursor: "pointer" }}>
                Apply
              </button>
              <button onClick={() => apply(p, true)} style={{ padding: "6px 10px", cursor: "pointer" }}>
                Apply &amp; Run
              </button>
              <button onClick={() => remove(p)} style={{ padding: "6px 10px", cursor: "pointer", color: "#b00020" }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
          No saved views yet. Set dates/filters, give it a name, then {"\""}Save current{"\""}.
        </p>
      )}
    </section>
  );
}
