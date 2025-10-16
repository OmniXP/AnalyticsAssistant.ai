/* eslint-disable @next/next/no-img-element */

// /pages/index.js
import { useEffect, useMemo, useState, useCallback } from "react";

/* ============================================================================
   Mini UI System (no deps) — aligns with ORB AI look using Google colors
   ========================================================================== */
function Card({ children, style, className = "" }) {
  const base = {
    padding: 16,
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "saturate(180%) blur(12px)",
    WebkitBackdropFilter: "saturate(180%) blur(12px)",
    border: "1px solid rgba(17, 24, 39, 0.08)",
    borderRadius: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  };
  return (
    <section className={`card ${className}`} style={{ ...base, ...(style || {}) }}>
      {children}
    </section>
  );
}

function SectionHeader({ title, children, style }) {
  return (
    <div
      className="section-head"
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "8px 4px", ...(style || {}) }}
    >
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Button({ variant = "default", disabled, style, children, ...rest }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(17, 24, 39, 0.08)",
    borderRadius: 9999,
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer",
    background: "#fff",
    transition: "transform .04s ease, box-shadow .2s ease, background .2s ease",
  };
  const variants = {
    default: { color: "#0f172a", background: "#fff" },
    primary: { color: "#fff", background: "#4285F4", border: "1px solid transparent" },
    danger: { color: "#fff", background: "#EA4335", border: "1px solid transparent" },
    ghost: { color: "#0f172a", background: "transparent" },
  };
  const hover = variant === "primary" ? { background: "#2b74f3" } : variant === "danger" ? { background: "#d03428" } : {};
  return (
    <button
      disabled={disabled}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      style={{ ...base, ...(variants[variant] || {}), ...(style || {}), ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}) }}
      {...rest}
      onMouseEnter={(e) => {
        if (!disabled) {
          Object.assign(e.currentTarget.style, hover);
        }
      }}
      onFocus={(e) => {
        if (!disabled) {
          Object.assign(e.currentTarget.style, hover);
        }
      }}
    >
      {children}
    </button>
  );
}

function TrendPill({ delta = 0, prefix = "", suffix = "%" }) {
  const up = Number(delta) > 0;
  const down = Number(delta) < 0;
  const color = up ? "#34A853" : down ? "#EA4335" : "#64748b";
  const sign = up ? "+" : down ? "" : "";
  return (
    <span
      className="pill"
      title="Change vs previous"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 9999,
        border: "1px solid rgba(17, 24, 39, 0.08)",
        background: "#fff",
        fontSize: 12,
        color,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      {`${prefix}${sign}${delta}${suffix}`}
    </span>
  );
}

/* ============================== Helpers ============================== */

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

const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";

/** -------- KPI Targets helpers & badge --------
 * Expected (in localStorage):
 *   {
 *     sessionsTarget: number,
 *     revenueTarget: number,
 *     cvrTarget: number
 *   }
 * Stored under either "insightgpt_kpi_targets_v1" or "kpi_targets_v1"
 */
function loadKpiTargets() {
  const keys = ["insightgpt_kpi_targets_v1", "kpi_targets_v1"];
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return {};
}
function saveKpiTargets(next) {
  try {
    localStorage.setItem("insightgpt_kpi_targets_v1", JSON.stringify(next || {}));
  } catch {}
}
function pctToTarget(current, target) {
  if (!target || target <= 0) return null;
  return Math.round((current / target) * 100);
}
function TargetBadge({ label, current, target, currency = false }) {
  if (target == null) return null;
  const pct = pctToTarget(current, target);
  if (pct == null) return null;
  const ok = pct >= 100;
  const val = currency
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(target)
    : Number(target).toLocaleString();
  return (
    <span
      title={`${label} target: ${val} • Progress: ${pct}%`}
      style={{
        marginLeft: 8,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: ok ? "#e6f4ea" : "#fdecea",
        color: ok ? "#137333" : "#b00020",
        border: `1px solid ${ok ? "#b7e1cd" : "#f4c7c3"}`,
      }}
    >
      {`${pct}% to ${label} target`}
    </span>
  );
}

/** -------- Premium gating (front-end test flag) -------- */
function getPremiumLabel() {
  if (typeof window === "undefined") return "";
  try {
    const p = localStorage.getItem("insightgpt_premium");
    if (!p) return "";
    const obj = JSON.parse(p);
    return obj?.label || "";
  } catch {
    return "";
  }
}
function hasPremium() {
  if (typeof window === "undefined") return false;
  try {
    const obj = JSON.parse(localStorage.getItem("insightgpt_premium") || "null");
    if (obj?.enabled) return true;
    if (window.__insightgpt_premium === true) return true;
    return false;
  } catch {
    return false;
  }
}

/** Alerts/digest config store (kept stable) */
function loadAlertsCfg() {
  try {
    const raw = localStorage.getItem("insightgpt_alerts_cfg_v1");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveAlertsCfg(cfg) {
  try {
    localStorage.setItem("insightgpt_alerts_cfg_v1", JSON.stringify(cfg || {}));
  } catch {}
}

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

/** Unified fetch helper */
async function fetchJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
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

  // KPI & Premium labels
  const [kpiVersion, setKpiVersion] = useState(0);
  const [premium, setPremium] = useState(false);
  const [premiumLabel, setPremiumLabel] = useState("");

  // Alerts / Digest config in memory
  const [alertsCfg, setAlertsCfg] = useState({});

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

  // Load premium/alerts cfg once
  useEffect(() => {
    setPremium(hasPremium());
    setPremiumLabel(getPremiumLabel());
    setAlertsCfg(loadAlertsCfg());
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
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
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

  // KPI save handler
  const onSaveKpis = useCallback((vals) => {
    saveKpiTargets(vals);
    setKpiVersion((n) => n + 1);
  }, []);

  // Digest test (Slack)
  const testDigest = async () => {
    try {
      const cfg = loadAlertsCfg();
      const wh = cfg?.digest?.webhook || "";
      if (!wh) {
        alert("Please paste a Slack webhook URL first, then Save.");
        return;
      }
      const r = await fetch("/api/slack/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test: true,
          propertyId,
          dateRange: { start: startDate, end: endDate },
          webhook: wh,
        }),
      });
      const t = await r.text();
      if (!r.ok) {
        console.warn("Digest test failed:", r.status, t || "");
        alert(`Digest test failed: ${r.status} ${t || ""}`);
        return;
      }
      alert("Sent a test digest ping to Slack (check your channel).");
    } catch (e) {
      console.error(e);
      alert("Failed to send test digest.");
    }
  };

  // Sticky toolbar style
  const toolbarStyle = {
    position: "sticky",
    top: 0,
    zIndex: 30,
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "saturate(180%) blur(12px)",
    WebkitBackdropFilter: "saturate(180%) blur(12px)",
    borderBottom: "1px solid rgba(17, 24, 39, 0.08)",
    padding: 12,
    borderRadius: 16,
  };

  return (
    <main
      style={{
        padding: 24,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        maxWidth: 1100,
        margin: "0 auto",
        background: "#f7f9fc",
        color: "#0f172a",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>InsightGPT (MVP)</h1>
        {premium ? (
          <span className="pill" style={{ background: "#e8f0fe", borderColor: "#d2e3fc", color: "#1a73e8" }}>
            Premium {premiumLabel ? `— ${premiumLabel}` : ""}
          </span>
        ) : (
          <span className="pill" style={{ background: "#fff", color: "#64748b" }}>Standard</span>
        )}
      </div>
      <p style={{ marginTop: 0, color: "#555" }}>
        Connect GA4, choose a date range, optionally apply filters, and view traffic &amp; insights.
      </p>

      {/* Sticky Controls */}
      <div className="sticky-toolbar card" style={toolbarStyle}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Button onClick={connect} title="Connect Google Analytics">
            Connect Google Analytics
          </Button>

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
            <input id="start-date" name="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: 8 }} />
          </label>
          <label>
            End date&nbsp;
            <input id="end-date" name="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: 8 }} />
          </label>

          <Button onClick={runReport} disabled={loading || !propertyId} variant="primary" title={!propertyId ? "Enter a GA4 property ID first" : ""}>
            {loading ? "Running…" : "Run GA4 Report"}
          </Button>

          <Button
            onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
            disabled={!rows.length}
            title={rows.length ? "Download table as CSV" : "Run a report first"}
          >
            Download CSV
          </Button>

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8, borderLeft: "1px solid #ddd" }}>
            <input id="compare-prev" type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
            Compare vs previous period
          </label>

          <Button onClick={resetDashboard} style={{ marginLeft: "auto" }}>
            Reset Dashboard
          </Button>
        </div>

        {/* Filters */}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed rgba(17,24,39,0.08)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>Filters:</b>
          <label>
            Country&nbsp;
            <select id="country-filter" value={countrySel} onChange={(e) => setCountrySel(e.target.value)} style={{ padding: 8 }}>
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label>
            Channel Group&nbsp;
            <select id="channel-filter" value={channelSel} onChange={(e) => setChannelSel(e.target.value)} style={{ padding: 8 }}>
              {CHANNEL_GROUP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={applyFilters}>Apply filters</Button>
          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span className="pill" style={{ background: "#e6f4ea", color: "#137333" }}>
              {`Filters active: `}
              {appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}
              {appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}
              {appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}
            </span>
          )}
          <span style={{ color: "#666", fontSize: 12 }}>Filters apply when you run a section (e.g., GA4 Report / Load buttons).</span>
        </div>
      </div>

      {/* KPI Targets & Alerts/Digest (settings panel) */}
      <SettingsPanel onSaveKpis={onSaveKpis} premium={premium} alertsCfg={alertsCfg} setAlertsCfg={setAlertsCfg} onTestDigest={testDigest} />

      {/* Saved Views */}
      <Card style={{ marginTop: 12, paddingTop: 8 }}>
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
      </Card>

      {error && <p style={{ color: "#EA4335", marginTop: 16 }}>Error: {error}</p>}

      {/* At a glance + Channels */}
      {rows.length > 0 && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Traffic by Default Channel Group</h2>
            {/* KPI badge for Sessions (hero) */}
            <TargetBadge label="Sessions" current={Number(totals?.sessions || 0)} target={Number(loadKpiTargets()?.sessionsTarget)} />
            {prevRows.length > 0 && (
              <TrendPill
                delta={Math.round(((Number(totals.sessions || 0) - Number(prevTotals.sessions || 0)) / Math.max(1, Number(prevTotals.sessions || 0))) * 100)}
              />
            )}
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
            <table className="table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="num">Sessions</th>
                  <th className="num">Users</th>
                  <th className="num">% of Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                  return (
                    <tr key={r.channel}>
                      <td>{r.channel}</td>
                      <td className="num">{r.sessions.toLocaleString()}</td>
                      <td className="num">{r.users.toLocaleString()}</td>
                      <td className="num">{pct}%</td>
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
        </Card>
      )}

      {/* Source / Medium */}
      <Card style={{ marginTop: 24 }}>
        <SourceMedium key={`sm-${dashKey}`} propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} resetSignal={refreshSignal} />
      </Card>

      {/* Trends over time */}
      <Card style={{ marginTop: 24 }}>
        <TrendsOverTime propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </Card>

      {/* Campaigns */}
      <Card style={{ marginTop: 24 }}>
        <Campaigns propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </Card>

      {/* Campaign drill-down */}
      <Card style={{ marginTop: 24 }}>
        <CampaignDrilldown propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </Card>

      {/* Campaigns Overview */}
      <Card style={{ marginTop: 24 }}>
        <CampaignsOverview propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </Card>

      {/* Top pages */}
      <Card style={{ marginTop: 24 }}>
        <TopPages key={`tp-${dashKey}`} propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} resetSignal={refreshSignal} />
      </Card>

      {/* Landing Pages × Attribution */}
      <Card style={{ marginTop: 24 }}>
        <LandingPages propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </Card>

      {/* E-commerce KPIs */}
      <Card style={{ marginTop: 24 }}>
        <EcommerceKPIs key={`ekpi-${dashKey}`} propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} resetSignal={refreshSignal} />
      </Card>

      {/* Checkout funnel */}
      <Card style={{ marginTop: 24 }}>
        <CheckoutFunnel key={`cf-${dashKey}`} propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} resetSignal={refreshSignal} />
      </Card>

      {process.env.NEXT_PUBLIC_ENABLE_PRODUCTS === "true" && (
        <Card style={{ marginTop: 24 }}>
          <Products propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} resetSignal={refreshSignal} />
        </Card>
      )}

      {/* Raw JSON (debug) */}
      {result ? (
        <details style={{ marginTop: 24 }}>
          <summary>Raw GA4 JSON (debug)</summary>
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 16, borderRadius: 8, overflow: "auto" }}>{safeStringify(result)}</pre>
        </details>
      ) : null}
    </main>
  );
}

/* ============================== Settings Panel: KPI + Alerts + Digest ============================== */
function SettingsPanel({ onSaveKpis, premium, alertsCfg, setAlertsCfg, onTestDigest }) {
  const [sessionsTarget, setSessionsTarget] = useState("");
  const [revenueTarget, setRevenueTarget] = useState("");
  const [cvrTarget, setCvrTarget] = useState("");

  // Anomaly alerts config
  const [sensitivityZ, setSensitivityZ] = useState(2);
  const [lookback, setLookback] = useState(28);
  const [alertSessions, setAlertSessions] = useState(true);
  const [alertRevenue, setAlertRevenue] = useState(true);
  const [alertCVR, setAlertCVR] = useState(true);
  const [slackWebhookAlerts, setSlackWebhookAlerts] = useState("");

  // Performance digest config
  const [digestWebhook, setDigestWebhook] = useState("");
  const [digestFreq, setDigestFreq] = useState("weekly");
  const [digestTime, setDigestTime] = useState("09:00");

  const [notice, setNotice] = useState("");

  useEffect(() => {
    // Load KPI targets
    const t = loadKpiTargets();
    if (t?.sessionsTarget != null) setSessionsTarget(String(t.sessionsTarget));
    if (t?.revenueTarget != null) setRevenueTarget(String(t.revenueTarget));
    if (t?.cvrTarget != null) setCvrTarget(String(t.cvrTarget));

    // Load alerts/digest cfg
    const cfg = loadAlertsCfg() || {};
    const a = cfg.alerts || {};
    const d = cfg.digest || {};

    if (a.sensitivityZ != null) setSensitivityZ(Number(a.sensitivityZ) || 2);
    if (a.lookback != null) setLookback(Number(a.lookback) || 28);
    setAlertSessions(Boolean(a.sessions ?? true));
    setAlertRevenue(Boolean(a.revenue ?? true));
    setAlertCVR(Boolean(a.cvr ?? true));
    if (a.webhook) setSlackWebhookAlerts(a.webhook);

    if (d.webhook) setDigestWebhook(d.webhook);
    if (d.frequency) setDigestFreq(d.frequency);
    if (d.time) setDigestTime(d.time);
  }, []);

  const saveAll = () => {
    // Save KPI
    const nextKpi = {
      sessionsTarget: Number(sessionsTarget) || 0,
      revenueTarget: Number(revenueTarget) || 0,
      cvrTarget: Number(cvrTarget) || 0,
    };
    saveKpiTargets(nextKpi);
    onSaveKpis(nextKpi);

    // Save alerts + digest under a single cfg
    const nextCfg = {
      alerts: {
        sensitivityZ: Number(sensitivityZ) || 2,
        lookback: Number(lookback) || 28,
        sessions: Boolean(alertSessions),
        revenue: Boolean(alertRevenue),
        cvr: Boolean(alertCVR),
        webhook: slackWebhookAlerts || "",
      },
      digest: {
        webhook: digestWebhook || "",
        frequency: digestFreq || "weekly",
        time: digestTime || "09:00",
      },
    };
    saveAlertsCfg(nextCfg);
    setAlertsCfg(nextCfg);

    setNotice("Saved!");
    setTimeout(() => setNotice(""), 1200);
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <SectionHeader title="KPI Targets &amp; Alerts / Digest">
        {notice && <span style={{ color: "#34A853", fontWeight: 600 }}>{notice}</span>}
        <Button onClick={saveAll} variant="primary">
          Save Settings
        </Button>
      </SectionHeader>

      <div style={{ display: "grid", gap: 16 }}>
        {/* KPI Targets */}
        <div>
          <h4 style={{ margin: "6px 0 8px" }}>KPI Targets</h4>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label>
              Sessions target&nbsp;
              <input value={sessionsTarget} onChange={(e) => setSessionsTarget(e.target.value)} type="number" min="0" step="1" style={{ padding: 8, width: 160 }} />
            </label>
            <label>
              Revenue target (GBP)&nbsp;
              <input value={revenueTarget} onChange={(e) => setRevenueTarget(e.target.value)} type="number" min="0" step="0.01" style={{ padding: 8, width: 180 }} />
            </label>
            <label title="Conversion rate target in %">
              CVR target (%)&nbsp;
              <input value={cvrTarget} onChange={(e) => setCvrTarget(e.target.value)} type="number" min="0" step="0.01" style={{ padding: 8, width: 140 }} />
            </label>
          </div>
          <p style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
            These targets power progress badges across Sessions, Revenue, and CVR.
          </p>
        </div>

        {/* Anomaly Alerts (Premium) */}
        <div style={{ marginTop: 8 }}>
          <h4 style={{ margin: "6px 0 8px" }}>
            Anomaly Alerts (Slack) — Premium {premium ? "" : <span style={{ color: "#EA4335" }}>&nbsp;· Premium required</span>}
          </h4>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label title="Higher z = fewer alerts (only stronger anomalies).">
              Sensitivity (z)&nbsp;
              <input value={sensitivityZ} onChange={(e) => setSensitivityZ(e.target.value)} type="number" step="0.1" style={{ padding: 8, width: 120 }} />
            </label>
            <label title="Days used to compute mean &sigma; std for anomaly detection.">
              Lookback days&nbsp;
              <input value={lookback} onChange={(e) => setLookback(e.target.value)} type="number" step="1" style={{ padding: 8, width: 120 }} />
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={alertSessions} onChange={(e) => setAlertSessions(e.target.checked)} />
              Sessions
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={alertRevenue} onChange={(e) => setAlertRevenue(e.target.checked)} />
              Revenue
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={alertCVR} onChange={(e) => setAlertCVR(e.target.checked)} />
              CVR
            </label>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ minWidth: 380 }}>
              Slack webhook (alerts)&nbsp;
              <input
                value={slackWebhookAlerts}
                onChange={(e) => setSlackWebhookAlerts(e.target.value)}
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                style={{ padding: 8, width: "100%" }}
              />
            </label>
            <Button onClick={saveAll} disabled={!premium} title={!premium ? "Enable premium to activate" : "Save alert preferences"}>
              Save Alerts
            </Button>
          </div>
          <p style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
            Sensitivity uses a z-score threshold (default 2.0). Lookback sets the rolling window for baseline mean and std.
          </p>
        </div>

        {/* Performance Digest */}
        <div style={{ marginTop: 8 }}>
          <h4 style={{ margin: "6px 0 8px" }}>
            Performance Digest (Slack) — Premium {premium ? "" : <span style={{ color: "#EA4335" }}>&nbsp;· Premium required</span>}
          </h4>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ minWidth: 380 }}>
              Slack webhook (digest)&nbsp;
              <input
                value={digestWebhook}
                onChange={(e) => setDigestWebhook(e.target.value)}
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                style={{ padding: 8, width: "100%" }}
              />
            </label>
            <label>
              Frequency&nbsp;
              <select value={digestFreq} onChange={(e) => setDigestFreq(e.target.value)} style={{ padding: 8 }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label title="24h time for daily/weekly digests (UTC unless your backend localises).">
              Time&nbsp;
              <input value={digestTime} onChange={(e) => setDigestTime(e.target.value)} type="time" style={{ padding: 8 }} />
            </label>
            <Button onClick={saveAll} disabled={!premium}>
              Save Digest
            </Button>
            <Button onClick={onTestDigest} disabled={!premium || !digestWebhook} variant="primary" title={!premium ? "Enable premium to test" : ""}>
              Send Test to Slack
            </Button>
          </div>
          <p style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
            Digest posts a compact summary (traffic, revenue, CVR) with AI insights. Use the test button to validate the channel.
          </p>
        </div>
      </div>
    </Card>
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
      <Button onClick={run} disabled={loading} variant={asButton ? "primary" : "default"}>
        {loading ? "Summarising…" : asButton ? buttonLabel : "Summarise with AI"}
      </Button>
      <Button onClick={copy} disabled={!text}>
        {copied ? "Copied!" : "Copy insight"}
      </Button>
      {error && <span style={{ color: "#EA4335" }}>Error: {error}</span>}
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
  const totalSessions = useMemo(() => rows.reduce((sum, r) => sum + (r.sessions || 0), 0), [rows]);
  const kpiTargets = useMemo(() => loadKpiTargets(), [rows]); // recalc for UI responsiveness

  return (
    <>
      <SectionHeader title="Source / Medium">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Source / Medium"}
        </Button>
        {rows.length > 0 && <TargetBadge label="Sessions" current={totalSessions} target={Number(kpiTargets?.sessionsTarget)} />}
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-source-medium"
          payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
        />
        <Button
          onClick={() =>
            downloadCsvGeneric(`source_medium_${startDate}_to_${endDate}`, rows, [
              { header: "Source", key: "source" },
              { header: "Medium", key: "medium" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
            ])
          }
          disabled={!rows.length}
        >
          Download CSV
        </Button>
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Medium</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.medium}-${i}`}>
                  <td>{r.source}</td>
                  <td>{r.medium}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </>
  );
}

/* ============================== Campaigns (overview) ============================== */
function Campaigns({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await fetchJson("/api/ga4/campaigns", {
        propertyId,
        startDate,
        endDate,
        filters,
        limit: 50,
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

  const totalSessions = useMemo(() => rows.reduce((sum, r) => sum + (r.sessions || 0), 0), [rows]);
  const kpiTargets = useMemo(() => loadKpiTargets(), [rows]);

  return (
    <>
      <SectionHeader title="Campaigns">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Campaigns"}
        </Button>
        {rows.length > 0 && <TargetBadge label="Sessions" current={totalSessions} target={Number(kpiTargets?.sessionsTarget)} />}
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-campaigns"
          payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
        />
        <Button
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
          disabled={!rows.length}
        >
          Download CSV
        </Button>
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.campaign}-${i}`}>
                  <td>{r.campaign}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </>
  );
}

/* ============================== Campaign drill-down ============================== */
function CampaignDrilldown({ propertyId, startDate, endDate, filters }) {
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [totals, setTotals] = useState(null);
  const [srcMed, setSrcMed] = useState([]);
  const [content, setContent] = useState([]);
  const [term, setTerm] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    setTotals(null);
    setSrcMed([]);
    setContent([]);
    setTerm([]);
    try {
      const data = await fetchJson("/api/ga4/campaign-detail", {
        propertyId,
        startDate,
        endDate,
        filters,
        campaign,
        limit: 25,
      });

      const t = data?.totals?.rows?.[0]?.metricValues || [];
      const totalsParsed = {
        sessions: Number(t?.[0]?.value || 0),
        users: Number(t?.[1]?.value || 0),
        transactions: Number(t?.[2]?.value || 0),
        revenue: Number(t?.[3]?.value || 0),
      };
      setTotals(totalsParsed);

      const parseRows = (rows) =>
        (rows || []).map((r, i) => ({
          d1: r.dimensionValues?.[0]?.value || "",
          d2: r.dimensionValues?.[1]?.value || "",
          sessions: Number(r.metricValues?.[0]?.value || 0),
          users: Number(r.metricValues?.[1]?.value || 0),
          transactions: Number(r.metricValues?.[2]?.value || 0),
          revenue: Number(r.metricValues?.[3]?.value || 0),
          key: `r-${i}`,
        }));

      setSrcMed(parseRows(data?.sourceMedium?.rows));
      setContent(
        (data?.adContent?.rows || []).map((r, i) => ({
          content: r.dimensionValues?.[0]?.value || "(not set)",
          sessions: Number(r.metricValues?.[0]?.value || 0),
          users: Number(r.metricValues?.[1]?.value || 0),
          transactions: Number(r.metricValues?.[2]?.value || 0),
          revenue: Number(r.metricValues?.[3]?.value || 0),
          key: `c-${i}`,
        }))
      );
      setTerm(
        (data?.term?.rows || []).map((r, i) => ({
          term: r.dimensionValues?.[0]?.value || "(not set)",
          sessions: Number(r.metricValues?.[0]?.value || 0),
          users: Number(r.metricValues?.[1]?.value || 0),
          transactions: Number(r.metricValues?.[2]?.value || 0),
          revenue: Number(r.metricValues?.[3]?.value || 0),
          key: `t-${i}`,
        }))
      );
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const cvr = totals && totals.sessions > 0 ? (totals.transactions / totals.sessions) * 100 : 0;
  const aov = totals && totals.transactions > 0 ? totals.revenue / totals.transactions : 0;

  return (
    <>
      <SectionHeader title="Campaign drill-down">
        <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Type exact campaign name…" style={{ padding: 8, minWidth: 260 }} />
        <Button onClick={load} disabled={loading || !propertyId || !campaign} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Campaign Details"}
        </Button>

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
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12 }}>
          <b>Totals for &ldquo;{campaign}&rdquo;:</b> Sessions {totals.sessions.toLocaleString()} &middot; Users {totals.users.toLocaleString()} &middot; Transactions{" "}
          {totals.transactions.toLocaleString()} &middot; Revenue{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} &middot; CVR {(cvr || 0).toFixed(2)}% &middot; AOV{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov || 0)}
        </div>
      )}

      {srcMed.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Source / Medium</h4>
          <table className="table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Medium</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
                <th className="num">Transactions</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {srcMed.map((r) => (
                <tr key={r.key}>
                  <td>{r.d1 || "(not set)"}</td>
                  <td>{r.d2 || "(not set)"}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                  <td className="num">{r.transactions.toLocaleString()}</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {content.length > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Ad Content (utm_content)</h4>
          <table className="table" style={{ minWidth: 660 }}>
            <thead>
              <tr>
                <th>Ad Content</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
                <th className="num">Transactions</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {content.map((r) => (
                <tr key={r.key}>
                  <td>{r.content}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                  <td className="num">{r.transactions.toLocaleString()}</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {term.length > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Term (utm_term)</h4>
          <table className="table" style={{ minWidth: 660 }}>
            <thead>
              <tr>
                <th>Term</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
                <th className="num">Transactions</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {term.map((r) => (
                <tr key={r.key}>
                  <td>{r.term}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                  <td className="num">{r.transactions.toLocaleString()}</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && !loading && !totals && <p style={{ marginTop: 8, color: "#666" }}>Enter a campaign name and click &ldquo;Load Campaign Details&rdquo;.</p>}
    </>
  );
}

/* ============================== Campaigns Overview ============================== */
function CampaignsOverview({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState(""); // client-side search

  const load = async () => {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await fetchJson("/api/ga4/campaigns", {
        propertyId,
        startDate,
        endDate,
        filters,
        limit: 100,
      });

      const parsed = (data.rows || []).map((r, i) => {
        const name = r.dimensionValues?.[0]?.value ?? "(not set)";
        const sessions = Number(r.metricValues?.[0]?.value || 0);
        const users = Number(r.metricValues?.[1]?.value || 0);
        const transactions = Number(r.metricValues?.[2]?.value || 0);
        const revenue = Number(r.metricValues?.[3]?.value || 0);
        const cvr = sessions > 0 ? (transactions / sessions) * 100 : 0;
        const aov = transactions > 0 ? revenue / transactions : 0;

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

  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

  const totalSessions = useMemo(() => visible.reduce((sum, r) => sum + (r.sessions || 0), 0), [visible]);
  const kpiTargets = useMemo(() => loadKpiTargets(), [visible]);

  return (
    <>
      <SectionHeader title="Campaigns (overview)">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Campaigns"}
        </Button>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign name…" style={{ padding: 8, minWidth: 220 }} />

        {visible.length > 0 && <TargetBadge label="Sessions" current={totalSessions} target={Number(kpiTargets?.sessionsTarget)} />}

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ kind: "campaigns-overview", campaigns: visible, dateRange: { start: startDate, end: endDate }, filters }}
        />

        <Button
          onClick={() =>
            downloadCsvGeneric(
              `campaigns_${startDate}_to_${endDate}`,
              visible.map((r) => ({
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
          disabled={!visible.length}
        >
          Download CSV
        </Button>
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {visible.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
                <th className="num">Transactions</th>
                <th className="num">Revenue</th>
                <th className="num">CVR</th>
                <th className="num">AOV</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                  <td className="num">{r.transactions.toLocaleString()}</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
                  <td className="num">{r.cvr.toFixed(2)}%</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.aov || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </>
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
    <>
      <SectionHeader title="Top pages (views)">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Top Pages"}
        </Button>
        <AiBlock asButton buttonLabel="Summarise with AI" endpoint="/api/insights/summarise-pages" payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }} resetSignal={resetSignal} />
        <Button
          onClick={() =>
            downloadCsvGeneric(`top_pages_${startDate}_to_${endDate}`, rows, [
              { header: "Title", key: "title" },
              { header: "Path", key: "path" },
              { header: "Views", key: "views" },
              { header: "Users", key: "users" },
            ])
          }
          disabled={!rows.length}
        >
          Download CSV
        </Button>
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Page Title</th>
                <th>Path</th>
                <th className="num">Views</th>
                <th className="num">Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.path}-${i}`}>
                  <td>{r.title}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.path}</td>
                  <td className="num">{r.views.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </>
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
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await fetchJson("/api/ga4/landing-pages", {
        propertyId,
        startDate,
        endDate,
        filters,
        limit: 500,
      });

      const parsed = (data?.rows || []).map((r, i) => ({
        landing: r.dimensionValues?.[0]?.value || "(unknown)",
        source: r.dimensionValues?.[1]?.value || "(unknown)",
        medium: r.dimensionValues?.[2]?.value || "(unknown)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
        transactions: Number(r.metricValues?.[2]?.value || 0),
        revenue: Number(r.metricValues?.[3]?.value || 0),
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
    if (minSessions > 0) out = out.filter((r) => (r.sessions || 0) >= minSessions);
    out = [...out].sort((a, b) => (b.sessions || 0) - (a.sessions || 0));
    if (topOnly) out = out.slice(0, 25);
    return out;
  }, [rows, minSessions, topOnly]);

  const shownCount = filtered.length;
  const totalCount = rows.length;

  const exportCsv = () => {
    downloadCsvGeneric(`landing_pages_${startDate}_to_${endDate}`, filtered, [
      { header: "Landing Page", key: "landing" },
      { header: "Source", key: "source" },
      { header: "Medium", key: "medium" },
      { header: "Sessions", key: "sessions" },
      { header: "Users", key: "users" },
      { header: "Transactions", key: "transactions" },
      { header: "Revenue", key: "revenue" },
    ]);
  };

  return (
    <>
      <SectionHeader title="Landing Pages × Attribution">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Landing Pages"}
        </Button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "landing-pages",
            dateRange: { start: startDate, end: endDate },
            filters,
            rows: filtered.slice(0, 50).map((r) => ({
              landing: r.landing,
              source: r.source,
              medium: r.medium,
              sessions: r.sessions,
              users: r.users,
              transactions: r.transactions,
              revenue: r.revenue,
            })),
            instructions: "Focus on landing pages with high sessions but low transactions/revenue. Identify source/medium mixes that underperform. Provide at least 2 clear hypotheses + tests to improve CR and AOV.",
          }}
        />

        <Button onClick={exportCsv} disabled={!filtered.length}>
          Download CSV
        </Button>
      </SectionHeader>

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
          />
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "right" }}>{minSessions}</span>
        </div>

        {rows.length > 0 && (
          <span style={{ fontSize: 12, color: "#555" }}>
            Showing <b>{shownCount.toLocaleString()}</b> of {totalCount.toLocaleString()}
          </span>
        )}
      </div>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {filtered.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Landing Page</th>
                <th>Source</th>
                <th>Medium</th>
                <th className="num">Sessions</th>
                <th className="num">Users</th>
                <th className="num">Transactions</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._k}>
                  <td style={{ fontFamily: "monospace" }}>{r.landing}</td>
                  <td>{r.source}</td>
                  <td>{r.medium}</td>
                  <td className="num">{r.sessions.toLocaleString()}</td>
                  <td className="num">{r.users.toLocaleString()}</td>
                  <td className="num">{r.transactions.toLocaleString()}</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !error && <p style={{ marginTop: 8, color: "#666" }}>{rows.length ? "No rows match your view filters." : "No rows loaded yet."}</p>}
    </>
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

  const kpiTargets = useMemo(() => loadKpiTargets(), [totals]);

  return (
    <>
      <SectionHeader title="E-commerce KPIs">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </Button>
        {/* KPI badges shown when totals loaded */}
        {totals && (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <TargetBadge label="Sessions" current={Number(totals?.sessions || 0)} target={Number(kpiTargets?.sessionsTarget)} />
            <TargetBadge label="Revenue" current={Number(totals?.revenue || 0)} target={Number(kpiTargets?.revenueTarget)} currency />
            <TargetBadge label="CVR" current={Number(totals?.cvr || 0)} target={Number(kpiTargets?.cvrTarget)} />
          </div>
        )}
        <AiBlock asButton buttonLabel="Summarise with AI" endpoint="/api/insights/summarise-ecom" payload={{ totals, dateRange: { start: startDate, end: endDate }, filters }} resetSignal={resetSignal} />
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && totals && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table" style={{ width: 560 }}>
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              <Tr label="Sessions" value={totals.sessions} />
              <Tr label="Users" value={totals.users} />
              <Tr label="Add-to-Cart (events)" value={totals.addToCarts} />
              <Tr label="Begin Checkout (events)" value={totals.beginCheckout} />
              <Tr label="Purchases (transactions)" value={totals.transactions} />
              <Tr label="Revenue" value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} />
              <Tr label="Conversion Rate (purchase / session)" value={`${(totals.cvr || 0).toFixed(2)}%`} />
              <Tr label="AOV (Revenue / Transactions)" value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.aov || 0)} />
            </tbody>
          </table>
        </div>
      )}
      {!error && !totals && <p style={{ marginTop: 8, color: "#666" }}>No data loaded yet.</p>}
    </>
  );
}

function Tr({ label, value }) {
  const formatted = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value;
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{formatted}</td>
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
      const data = await fetchJson("/api/ga4/checkout-funnel", { propertyId, startDate, endDate, filters });
      setSteps(data?.steps || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SectionHeader title="Checkout funnel (event counts)">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Checkout Funnel"}
        </Button>
        <AiBlock asButton buttonLabel="Summarise with AI" endpoint="/api/insights/summarise-funnel" payload={{ steps, dateRange: { start: startDate, end: endDate }, filters }} resetSignal={resetSignal} />
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {steps ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table" style={{ width: 520 }}>
            <thead>
              <tr>
                <th>Step</th>
                <th className="num">Count</th>
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
                  <td>{label}</td>
                  <td className="num">{(val || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>
      )}
    </>
  );
}

/* ============================== Trends Over Time ============================== */
function TrendsOverTime({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState("daily");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
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
    const year = Number(m[1]);
    const week = Number(m[2]);
    const start = isoWeekStartUTC(year, week);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const startStr = `${pad2(start.getUTCDate())} ${MONTHS[start.getUTCMonth()]}`;
    const endStr = `${pad2(end.getUTCDate())} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
    return `${startStr}–${endStr}`;
  }
  function formatYYYYMMDD(s) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s) || "");
    if (!m) return String(s || "");
    const y = Number(m[1]),
      mo = Number(m[2]),
      d = Number(m[3]);
    return `${String(d).padStart(2, "0")} ${MONTHS[mo - 1]} ${y}`;
  }
  function displayPeriodLabel(raw, gran) {
    return gran === "weekly" ? formatYearWeekRange(raw) : formatYYYYMMDD(raw);
  }

  function buildLineChartUrl(series) {
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

  const load = async () => {
    setLoading(true);
    setError("");
    setRows([]);
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
    <>
      <SectionHeader title="Trends over time">
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Granularity
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)} style={{ padding: 6 }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Trends"}
        </Button>

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
            goals: ["Call out surges/drops and likely drivers", "Flag seasonality or anomalies", "Recommend 2–3 next actions or tests"],
          }}
        />

        <Button
          onClick={() =>
            downloadCsvGeneric(`timeseries_${granularity}_${startDate}_to_${endDate}`, rows, [
              { header: "Period", key: "period" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
              { header: "Transactions", key: "transactions" },
              { header: "Revenue", key: "revenue" },
            ])
          }
          disabled={!hasRows}
        >
          Download CSV
        </Button>
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img src={buildLineChartUrl(rows)} alt="Sessions &amp; Users trend" style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }} />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="num">Sessions</th>
                  <th className="num">Users</th>
                  <th className="num">Transactions</th>
                  <th className="num">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = displayPeriodLabel(r.period, granularity);
                  return (
                    <tr key={r.period} title={r.period}>
                      <td>{label}</td>
                      <td className="num">{r.sessions.toLocaleString()}</td>
                      <td className="num">{r.users.toLocaleString()}</td>
                      <td className="num">{r.transactions.toLocaleString()}</td>
                      <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
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
    </>
  );
}

/* ============================== Product Performance ============================== */
function Products({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]); // [{ name, id, views, carts, purchases, revenue }]
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null); // raw GA4 response

  useEffect(() => {
    setRows([]);
    setError("");
    setDebug(null);
  }, [resetSignal]);

  function parseProductsResponse(data) {
    if (!data || !Array.isArray(data.rows)) return [];

    const dimNames = (data.dimensionHeaders || []).map((h) => h.name);
    const metNames = (data.metricHeaders || []).map((h) => h.name);

    const iItemName = dimNames.findIndex((n) => n === "itemName");
    const iItemId = dimNames.findIndex((n) => n === "itemId");

    const iViews = metNames.findIndex((n) => n === "itemViews");
    const iCarts = metNames.findIndex((n) => n === "addToCarts");
    const iPurchQty = metNames.findIndex((n) => n === "itemPurchaseQuantity");
    const iPurchAlt1 = metNames.findIndex((n) => n === "itemsPurchased");
    const iRevenue = metNames.findIndex((n) => n === "itemRevenue");

    return data.rows.map((r, idx) => {
      const name =
        iItemName >= 0 ? r.dimensionValues?.[iItemName]?.value || "(unknown)" : iItemId >= 0 ? r.dimensionValues?.[iItemId]?.value || "(unknown)" : `(row ${idx + 1})`;

      const views = iViews >= 0 ? Number(r.metricValues?.[iViews]?.value || 0) : 0;
      const carts = iCarts >= 0 ? Number(r.metricValues?.[iCarts]?.value || 0) : 0;
      const purchases =
        iPurchQty >= 0 ? Number(r.metricValues?.[iPurchQty]?.value || 0) : iPurchAlt1 >= 0 ? Number(r.metricValues?.[iPurchAlt1]?.value || 0) : 0;
      const revenue = iRevenue >= 0 ? Number(r.metricValues?.[iRevenue]?.value || 0) : 0;

      return {
        key: `p-${idx}`,
        name,
        id: iItemId >= 0 ? r.dimensionValues?.[iItemId]?.value || "" : "",
        views,
        carts,
        purchases,
        revenue,
      };
    });
  }

  async function load() {
    setLoading(true);
    setError("");
    setRows([]);
    setDebug(null);
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
      setDebug({
        which,
        headers: {
          dimensions: (data?.dimensionHeaders || []).map((h) => h.name),
          metrics: (data?.metricHeaders || []).map((h) => h.name),
        },
      });

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

  const exportCsv = () =>
    rows.length &&
    downloadCsvGeneric(
      `product_performance_${startDate}_to_${endDate}`,
      rows.map((r) => ({
        name: r.name,
        id: r.id,
        views: r.views,
        carts: r.carts,
        purchases: r.purchases,
        revenue: r.revenue,
      })),
      [
        { header: "Item name/ID", key: "name" },
        { header: "Item ID", key: "id" },
        { header: "Items viewed", key: "views" },
        { header: "Items added to cart", key: "carts" },
        { header: "Items purchased", key: "purchases" },
        { header: "Item revenue", key: "revenue" },
      ]
    );

  return (
    <>
      <SectionHeader title="Product Performance">
        <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading…" : "Load Products"}
        </Button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "products",
            dateRange: { start: startDate, end: endDate },
            filters,
            rows: rows.slice(0, 50).map((r) => ({
              name: r.name,
              id: r.id,
              views: r.views,
              carts: r.carts,
              purchases: r.purchases,
              revenue: r.revenue,
            })),
            instructions: "Identify SKUs with high views but low add-to-carts or purchases. Call out likely issues (pricing, imagery, PDP UX). Provide 2–3 testable hypotheses to improve add-to-cart rate and conversion.",
          }}
          resetSignal={resetSignal}
        />

        <Button onClick={exportCsv} disabled={!rows.length}>
          Download CSV
        </Button>

        <span style={{ color: "#666", fontSize: 12 }}>Respects global filters (Country / Channel Group).</span>
      </SectionHeader>

      {error && <p style={{ color: "#EA4335", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Item ID</th>
                <th className="num">Items viewed</th>
                <th className="num">Items added to cart</th>
                <th className="num">Items purchased</th>
                <th className="num">Item revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td style={{ fontFamily: "monospace" }}>{r.id || "—"}</td>
                  <td className="num">{r.views.toLocaleString()}</td>
                  <td className="num">{r.carts.toLocaleString()}</td>
                  <td className="num">{r.purchases.toLocaleString()}</td>
                  <td className="num">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</td>
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
          <pre style={{ marginTop: 8, background: "#f8f8f8", padding: 12, borderRadius: 6, overflow: "auto" }}>{JSON.stringify(debug, null, 2)}</pre>
        </details>
      )}
    </>
  );
}

/* ============================== Saved Views ============================== */
function SavedViews({ startDate, endDate, countrySel, channelSel, comparePrev, onApply, onRunReport }) {
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
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(arr));
    } catch {}
  };

  const saveCurrent = () => {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      setNotice("Give your view a name.");
      return;
    }

    const next = [
      ...presets.filter((p) => p.name !== trimmed),
      {
        id: crypto?.randomUUID?.() || String(Date.now()),
        name: trimmed,
        startDate,
        endDate,
        country: countrySel,
        channelGroup: channelSel,
        comparePrev: !!comparePrev,
        savedAt: new Date().toISOString(),
      },
    ].sort((a, b) => a.name.localeCompare(b.name));

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
    const next = presets.filter((x) => x.name !== p.name);
    persist(next);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Saved Views</h3>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view (e.g. UK · Organic · Sep)" style={{ padding: 8, minWidth: 260 }} />
        <Button onClick={saveCurrent}>Save current</Button>
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
              <Button onClick={() => apply(p, false)}>Apply</Button>
              <Button onClick={() => apply(p, true)}>Apply &amp; Run</Button>
              <Button onClick={() => remove(p)} variant="danger">
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ marginTop: 8, color: "#666", fontSize: 13 }}>No saved views yet. Set dates/filters, give it a name, then &ldquo;Save current&rdquo;.</p>
      )}
    </>
  );
}

/* ========================================================================== */
/* ============================== Change Management ========================== */
/* ========================================================================== */
/*
CHANGE LOG
- Added a lightweight UI system (Card, SectionHeader, Button, TrendPill) to align with ORB AI frosted style and Google colors.
- Wrapped all sections in <Card> and standardized headers and actions via <SectionHeader> and <Button>.
- Introduced sticky toolbar with glass effect; preserved all existing controls and behaviors.
- Restored and enhanced KPI Targets panel; targets persist under "insightgpt_kpi_targets_v1".
- Kept Anomaly Alerts (Premium) settings within the same Settings panel (sensitivity z, lookback, metrics toggles, Slack webhook) persisted in "insightgpt_alerts_cfg_v1".
- Kept Performance Digest (Slack) — Premium, added "Send Test to Slack" button calling /api/slack/digest with test payload.
- Preserved all analytics sections, AI summaries, CSV exports, and debug.
- Fixed ESLint quote issues by using &ldquo; &rdquo; or escaping where necessary; retained img with top-level ESLint disable as QuickChart domain may not be configured for next/image.

COMPATIBILITY NOTES
- Public interfaces, APIs, storage keys, env names, and feature flags are unchanged.
- Uses inline styles plus class names; if you add the provided tokens in globals.css, visuals will further match ORB AI, but this file works standalone.
- Premium gating still reads from localStorage key "insightgpt_premium" (JSON with { enabled: boolean, label?: string }) and optional window.__insightgpt_premium = true.
- For Slack tests, /api/slack/digest must exist server-side (unchanged).

ASSUMPTIONS
- QuickChart usage remains via <img>; switching to next/image would require next.config.js domain allow-list (not changed per constraints).
- Currency assumed GBP for formatting where not otherwise specified by backend.
- You already have backend routes for GA4 queries and /api/insights/* endpoints as per your existing MVP.
*/
