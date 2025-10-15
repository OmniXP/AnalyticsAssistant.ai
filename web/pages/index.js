// pages/index.js
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useMemo, useState } from "react";

/* =========================================================================
   Helpers & Constants
   ========================================================================= */

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
const ALERTS_KEY = "insightgpt_alerts_cfg_v1"; // premium + webhook + alerts/digest config

/* ----- KPI Targets helpers & badge -----
   Expected localStorage keys (unchanged):
   - insightgpt_kpi_targets_v1  (preferred)
   - kpi_targets_v1             (legacy fallback)
*/
function loadKpiTargets() {
  if (typeof window === "undefined") return {};
  const keys = ["insightgpt_kpi_targets_v1", "kpi_targets_v1"];
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return {};
}
function pctToTarget(current, target) {
  if (!target || target <= 0) return null;
  return Math.round((Number(current || 0) / Number(target)) * 100);
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
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: ok ? "#e6f4ea" : "#fdecea",
        color: ok ? "#137333" : "#b00020",
        border: `1px solid ${ok ? "#b7e1cd" : "#f4c7c3"}`
      }}
    >
      {`${pct}% to ${label} target`}
    </span>
  );
}

/** -------- Premium gating / Alerts config --------
 * Stored in localStorage under ALERTS_KEY:
 * {
 *   premiumActive: boolean,
 *   slackWebhook: string,
 *   // anomaly alerts
 *   alertsEnabled: boolean,
 *   zThreshold: number,
 *   lookbackDays: number,
 *   metrics: { sessions: boolean, revenue: boolean, cvr: boolean },
 *   // digest
 *   digestEnabled: boolean,
 *   digestFrequency: "off"|"daily"|"weekly",
 *   digestHour: number,     // 0..23
 *   digestMinute: number,   // 0..59
 *   digestDow: number,      // 1..7  (1=Mon ... 7=Sun)  - used for weekly display only
 * }
 */
function loadAlertsCfg() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed || {};
  } catch {
    return {};
  }
}
function saveAlertsCfg(next) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(next)); } catch {}
}

/** -------- Formatting helpers -------- */
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

/** -------- CSV helpers -------- */
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

/** -------- Simple charts via QuickChart -------- */
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

/** -------- Fetch helper (unified) -------- */
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

/** -------- GA4 parsers used across sections -------- */
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

/* =========================================================================
   Page
   ========================================================================= */
export default function Home() {
  // Base controls
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  // Fires whenever the user runs a fresh report (to reset AI & section data)
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Filters (current selectors)
  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");

  // Filters applied to GA calls
  const [appliedFilters, setAppliedFilters] = useState({ country: "All", channelGroup: "All" });

  // Re-mount key for hard resets
  const [dashKey, setDashKey] = useState(1);

  // Channel results (hero)
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Premium + Alerts config
  const [alertsCfg, setAlertsCfg] = useState({}); // includes webhook, premiumActive, alerts + digest settings
  useEffect(() => {
    setAlertsCfg(loadAlertsCfg());
  }, []);

  /* ---- URL & Preset bootstrapping ---- */
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const q = decodeQuery();
      if (!q) return;

      if (q.startDate) setStartDate(q.startDate);
      if (q.endDate) setEndDate(q.endDate);

      setCountrySel(q.country || "All");
      setChannelSel(q.channelGroup || "All");
      setAppliedFilters({ country: q.country || "All", channelGroup: q.channelGroup || "All" });

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

  /* ---- Hero data ---- */
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
  const applyFilters = () => {
    setAppliedFilters({ country: countrySel, channelGroup: channelSel });
  };

  /* ---- GA4 channel query (used by hero + digest fallback) ---- */
  async function fetchGa4Channels({ propertyId, startDate, endDate, filters }) {
    return fetchJson("/api/ga4/query", { propertyId, startDate, endDate, filters });
  }

  /* ---- Run hero report ---- */
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

      // Update URL for shareable view
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

  /* ---- Reset dashboard (preserves propertyId) ---- */
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
    setDashKey((k) => k + 1); // force remount
    try {
      const path = window.location.pathname;
      window.history.replaceState(null, "", path);
    } catch {}
  };

  /* =========================================================================
     UI
     ========================================================================= */
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Connect GA4, choose a date range, optionally apply filters, and view traffic &amp; insights.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
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
          onClick={() => downloadCsvChannels(parseGa4Channels(result).rows, parseGa4Channels(result).totals, startDate, endDate)}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={!parseGa4Channels(result).rows.length}
          title={parseGa4Channels(result).rows.length ? "Download table as CSV" : "Run a report first"}
        >
          Download CSV
        </button>

        <label htmlFor="compare-prev" style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8, borderLeft: "1px solid #ddd" }}>
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
              {["All","United Kingdom","United States","Ireland","Germany","France","Spain","Italy","Netherlands","Australia","Canada","India"].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label htmlFor="channel-filter">Channel Group&nbsp;
            <select id="channel-filter" value={channelSel} onChange={(e) => setChannelSel(e.target.value)} style={{ padding: 8 }}>
              {["All","Direct","Organic Search","Paid Search","Organic Social","Paid Social","Email","Referral","Display","Video","Affiliates","Organic Shopping","Paid Shopping"].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
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
      {parseGa4Channels(result).rows.length > 0 && (
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
              endpoint="/api/insights/summarise-pro"
              payload={{ topic: "channels", rows: parseGa4Channels(result).rows, totals, dateRange: { start: startDate, end: endDate }, filters: appliedFilters }}
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
            {/* Using <img> with lint disabled at top; switching to next/image may require next.config domain allow-list */}
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

      {/* KPI Targets panel */}
      <KpiTargetsPanel />

      {/* Anomaly Alerts (premium) */}
      <AnomalyAlertsPanel
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        premiumActive={!!alertsCfg?.premiumActive}
        alertsCfg={alertsCfg}
        onUpdateCfg={(next) => { setAlertsCfg(next); saveAlertsCfg(next); }}
      />

      {/* Performance Digest (Slack) — Premium */}
      <DigestPanel
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        premiumActive={!!alertsCfg?.premiumActive}
        alertsCfg={alertsCfg}
        onUpdateCfg={(next) => { setAlertsCfg(next); saveAlertsCfg(next); }}
        latestHero={{ result, parsed: { rows, totals } }}
      />

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

/* =========================================================================
   Reusable AI block
   ========================================================================= */
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

/* =========================================================================
   Source / Medium
   ========================================================================= */
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
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

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
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "source_medium", rows, dateRange: { start: startDate, end: endDate }, filters }}
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

/* =========================================================================
   Campaigns (overview)
   ========================================================================= */
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
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

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
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "channels", rows: rows.map(r => ({ channel: r.campaign, sessions: r.sessions, users: r.users })), totals: { sessions: totalSessions, users: rows.reduce((a,b)=>a+(b.users||0),0) }, dateRange: { start: startDate, end: endDate }, filters }}
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
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* =========================================================================
   Campaign drill-down
   ========================================================================= */
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
            topic: "channels",
            rows: srcMed.map(r => ({ channel: `${r.d1}/${r.d2}`, sessions: r.sessions, users: r.users })),
            totals: { sessions: (totals?.sessions||0), users: (totals?.users||0) },
            dateRange: { start: startDate, end: endDate },
            filters,
          }}
        />
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12 }}>
          <b>Totals for &ldquo;{campaign}&rdquo;:</b>{" "}
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
        <p style={{ marginTop: 8, color: "#666" }}>Enter a campaign name and click &ldquo;Load Campaign Details&rdquo;.</p>
      )}
    </section>
  );
}

/* =========================================================================
   Campaigns Overview
   ========================================================================= */
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
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Campaigns (overview)</h3>

        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign name…" style={{ padding: 8, minWidth: 220 }} />

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
          payload={{ topic: "channels", rows: visible.map(r => ({ channel: r.name, sessions: r.sessions, users: r.users })), totals: { sessions: totalSessions, users: visible.reduce((a,b)=>a+(b.users||0),0) }, dateRange: { start: startDate, end: endDate }, filters }}
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

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

/* =========================================================================
   Top Pages
   ========================================================================= */
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
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "pages", rows, dateRange: { start: startDate, end: endDate }, filters }}
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
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}
    </section>
  );
}

/* =========================================================================
   Landing Pages × Attribution
   ========================================================================= */
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
            topic: "pages",
            dateRange: { start: startDate, end: endDate },
            filters,
            rows: filtered.slice(0, 50).map(r => ({
              title: r.landing, path: r.landing, views: r.sessions, users: r.users
            })),
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

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

/* =========================================================================
   E-commerce KPIs
   ========================================================================= */
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

  const kpiTargets = useMemo(() => loadKpiTargets(), []);

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
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "ecom_kpis", totals, dateRange: { start: startDate, end: endDate }, filters }}
          resetSignal={resetSignal}
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

/* =========================================================================
   Checkout Funnel
   ========================================================================= */
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
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "checkout_funnel",
            steps: steps || {},
            rates: steps ? {
              cart_to_checkout_pct: pctSafe((steps?.begin_checkout || 0), (steps?.add_to_cart || 0)),
              checkout_to_purchase_pct: pctSafe((steps?.purchase || 0), (steps?.begin_checkout || 0)),
              cart_to_purchase_pct: pctSafe((steps?.purchase || 0), (steps?.add_to_cart || 0)),
            } : {},
            dateRange: { start: startDate, end: endDate },
            filters,
            targets: {
              cart_to_checkout_pct: Number(loadKpiTargets()?.c2cTarget || 40),
              checkout_to_purchase_pct: Number(loadKpiTargets()?.c2pTarget || 25),
              cart_to_purchase_pct: Number(loadKpiTargets()?.cart2pTarget || 10),
            },
          }}
          resetSignal={resetSignal}
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
function pctSafe(num, den) {
  if (!den) return 0;
  return (Number(num || 0) / Number(den || 0)) * 100;
}

/* =========================================================================
   Trends Over Time
   ========================================================================= */
function TrendsOverTime({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState("daily");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

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

        <label htmlFor="granularity" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Granularity
          <select id="granularity" value={granularity} onChange={(e) => setGranularity(e.target.value)} style={{ padding: 6 }}>
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
            topic: "channels", // reuse for timeseries commentary context-light
            rows: [],
            totals: {},
            dateRange: { start: startDate, end: endDate },
            filters,
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows)}
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

/* =========================================================================
   Product Performance (feature-flagged)
   ========================================================================= */
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
            topic: "pages",
            rows: rows.slice(0, 50).map(r => ({
              title: r.name,
              path: r.id,
              views: r.views,
              users: r.purchases, // lightweight signal to show demand
            })),
            dateRange: { start: startDate, end: endDate },
            filters,
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

/* =========================================================================
   Saved Views
   ========================================================================= */
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
          No saved views yet. Set dates/filters, give it a name, then &ldquo;Save current&rdquo;.
        </p>
      )}
    </section>
  );
}

/* =========================================================================
   KPI Targets panel
   ========================================================================= */
function KpiTargetsPanel() {
  const [targets, setTargets] = useState({ sessionsTarget: "", revenueTarget: "", cvrTarget: "" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("insightgpt_kpi_targets_v1") || localStorage.getItem("kpi_targets_v1");
      const parsed = raw ? JSON.parse(raw) : {};
      setTargets({
        sessionsTarget: parsed.sessionsTarget ?? "",
        revenueTarget: parsed.revenueTarget ?? "",
        cvrTarget: parsed.cvrTarget ?? "",
      });
    } catch {}
  }, []);

  const persist = (next) => {
    setTargets(next);
    try { localStorage.setItem("insightgpt_kpi_targets_v1", JSON.stringify(next)); } catch {}
  };

  return (
    <section style={{ marginTop: 28, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <h3 style={{ margin: "0 0 8px" }}>KPI Targets</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label>Sessions target&nbsp;
          <input
            inputMode="numeric"
            value={targets.sessionsTarget}
            onChange={(e) => persist({ ...targets, sessionsTarget: e.target.value })}
            placeholder="e.g. 120000"
            style={{ padding: 8, minWidth: 140 }}
          />
        </label>
        <label>Revenue target (GBP)&nbsp;
          <input
            inputMode="numeric"
            value={targets.revenueTarget}
            onChange={(e) => persist({ ...targets, revenueTarget: e.target.value })}
            placeholder="e.g. 250000"
            style={{ padding: 8, minWidth: 140 }}
          />
        </label>
        <label>CVR target (%)&nbsp;
          <input
            inputMode="decimal"
            value={targets.cvrTarget}
            onChange={(e) => persist({ ...targets, cvrTarget: e.target.value })}
            placeholder="e.g. 2.5"
            style={{ padding: 8, minWidth: 120 }}
          />
        </label>
        <button
          onClick={() => { setNotice("Saved"); setTimeout(() => setNotice(""), 1200); }}
          style={{ padding: "8px 12px", cursor: "pointer" }}
        >
          Save
        </button>
        {notice && <span style={{ color: "#137333", fontSize: 12 }}>{notice}</span>}
      </div>
      <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
        Badges above sections show % progress to these targets.
      </p>
    </section>
  );
}

/* =========================================================================
   Anomaly Alerts (Premium)
   ========================================================================= */
function AnomalyAlertsPanel({ propertyId, startDate, endDate, filters, premiumActive, alertsCfg, onUpdateCfg }) {
  const [z, setZ] = useState(Number(alertsCfg?.zThreshold ?? 2));
  const [lookback, setLookback] = useState(Number(alertsCfg?.lookbackDays ?? 28));
  const [enabled, setEnabled] = useState(!!alertsCfg?.alertsEnabled);
  const [mSessions, setMSessions] = useState(alertsCfg?.metrics?.sessions ?? true);
  const [mRevenue, setMRevenue] = useState(alertsCfg?.metrics?.revenue ?? true);
  const [mCvr, setMCvr] = useState(alertsCfg?.metrics?.cvr ?? false);
  const [webhook, setWebhook] = useState(alertsCfg?.slackWebhook || "");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setZ(Number(alertsCfg?.zThreshold ?? 2));
    setLookback(Number(alertsCfg?.lookbackDays ?? 28));
    setEnabled(!!alertsCfg?.alertsEnabled);
    setMSessions(alertsCfg?.metrics?.sessions ?? true);
    setMRevenue(alertsCfg?.metrics?.revenue ?? true);
    setMCvr(alertsCfg?.metrics?.cvr ?? false);
    setWebhook(alertsCfg?.slackWebhook || "");
  }, [alertsCfg]);

  const persist = (next) => onUpdateCfg(next);

  async function testDetectAndSend() {
    setStatus("Running detection…");
    try {
      if (!premiumActive) throw new Error("Premium is required for Slack alerts.");
      if (!webhook) throw new Error("Add a Slack webhook URL first.");

      // pull a daily timeseries to compute anomalies locally
      const ts = await fetchJson("/api/ga4/timeseries", {
        propertyId,
        startDate,
        endDate,
        filters,
        granularity: "daily",
      });
      const series = ts?.series || [];

      // compute z-score anomalies for selected metrics
      const findings = [];
      const metrics = [
        mSessions && "sessions",
        mRevenue && "revenue",
        mCvr && "cvr",
      ].filter(Boolean);

      metrics.forEach((metric) => {
        const arr = series.map(s => {
          const val = metric === "cvr"
            ? (Number(s.sessions) ? (Number(s.transactions || 0) / Number(s.sessions)) * 100 : 0)
            : Number(s[metric] || 0);
          return { period: s.period, value: val };
        }).filter(x => Number.isFinite(x.value));

        // rolling z-score with lookback window
        for (let i = lookback; i < arr.length; i++) {
          const window = arr.slice(i - lookback, i).map(x => x.value);
          const mean = window.reduce((a,b)=>a+b,0) / window.length;
          const variance = window.reduce((a,b)=>a + Math.pow(b - mean, 2), 0) / window.length;
          const std = Math.sqrt(variance) || 0;
          const zScore = std ? (arr[i].value - mean) / std : 0;
          if (Math.abs(zScore) >= z) {
            findings.push({
              metric: metric.toUpperCase(),
              period: arr[i].period, // YYYYMMDD
              value: arr[i].value,
              z: zScore,
            });
          }
        }
      });

      findings.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
      const header = `Anomalies detected (Property ${propertyId}, ${startDate} → ${endDate})\nZ≥${z}, lookback ${lookback} days`;
      const lines = findings.slice(0, 10).map(f => {
        return `• ${f.metric} ${f.z >= 0 ? "+" : ""}${(Math.abs(f.z)).toFixed(2)}σ on ${f.period} — value ${Number(f.value).toLocaleString()}`;
      });
      const kpi = loadKpiTargets();
      const toPct = (n) => `${(Number(n||0)).toFixed(2)}%`;
      const progressLine = `Targets: Sessions ${pctToTarget(ts?.totals?.sessions||0, kpi.sessionsTarget) ?? 0}% · Revenue ${pctToTarget(ts?.totals?.revenue||0, kpi.revenueTarget) ?? 0}% · CVR ${toPct(kpi.cvrTarget ?? 0)}`;

      const payload = { text: [header, ...lines, progressLine].join("\n") };
      const resp = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error(`Slack responded ${resp.status}`);
      setStatus("Sent anomalies to Slack ✓");
    } catch (e) {
      setStatus(`Error: ${String(e.message || e)}`);
    }
  }

  return (
    <section style={{ marginTop: 28, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Anomaly Alerts (Slack) — Premium</h3>
        {!premiumActive && <span style={{ color: "#b00020" }}>Premium required</span>}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>Enable alerts&nbsp;
            <input type="checkbox" checked={enabled} onChange={(e) => persist({ ...alertsCfg, alertsEnabled: e.target.checked })} />
          </label>
          <label>Sensitivity (Z)&nbsp;
            <input inputMode="decimal" value={z} onChange={(e)=>persist({ ...alertsCfg, zThreshold: Number(e.target.value || 2) })} style={{ padding: 6, width: 80 }} />
          </label>
          <label>Lookback days&nbsp;
            <input inputMode="numeric" value={lookback} onChange={(e)=>persist({ ...alertsCfg, lookbackDays: Number(e.target.value || 28) })} style={{ padding: 6, width: 90 }} />
          </label>
          <label><input type="checkbox" checked={mSessions} onChange={(e)=>persist({ ...alertsCfg, metrics: { ...(alertsCfg.metrics||{}), sessions: e.target.checked, revenue: mRevenue, cvr: mCvr } })} /> Sessions</label>
          <label><input type="checkbox" checked={mRevenue} onChange={(e)=>persist({ ...alertsCfg, metrics: { ...(alertsCfg.metrics||{}), sessions: mSessions, revenue: e.target.checked, cvr: mCvr } })} /> Revenue</label>
          <label><input type="checkbox" checked={mCvr} onChange={(e)=>persist({ ...alertsCfg, metrics: { ...(alertsCfg.metrics||{}), sessions: mSessions, revenue: mRevenue, cvr: e.target.checked } })} /> CVR</label>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>Slack Webhook&nbsp;
            <input value={webhook} onChange={(e)=>persist({ ...alertsCfg, slackWebhook: e.target.value })} placeholder="https://hooks.slack.com/services/..." style={{ padding: 8, minWidth: 360 }} />
          </label>
          <button onClick={testDetectAndSend} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!premiumActive || !propertyId}>
            Test: Detect &amp; send now
          </button>
          {status && <span style={{ color: status.startsWith("Error") ? "#b00020" : "#137333" }}>{status}</span>}
        </div>
      </div>
      <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
        Sensitivity controls how extreme a z-score must be to trigger; higher Z means fewer alerts. Lookback defines the historical window to model "normal".
      </p>
    </section>
  );
}

/* =========================================================================
   Performance Digest (Slack) — Premium
   ========================================================================= */
function DigestPanel({ propertyId, startDate, endDate, filters, premiumActive, alertsCfg, onUpdateCfg, latestHero }) {
  const [status, setStatus] = useState("");

  const digestEnabled = !!alertsCfg?.digestEnabled;
  const digestFrequency = alertsCfg?.digestFrequency || "off"; // off|daily|weekly
  const digestHour = Number(alertsCfg?.digestHour ?? 9);
  const digestMinute = Number(alertsCfg?.digestMinute ?? 0);
  const digestDow = Number(alertsCfg?.digestDow ?? 1); // 1..7, for display only
  const webhook = alertsCfg?.slackWebhook || "";

  const persist = (next) => onUpdateCfg(next);

  async function sendDigestNow() {
    setStatus("Building digest…");
    try {
      if (!premiumActive) throw new Error("Premium is required for Slack digests.");
      if (!webhook) throw new Error("Add a Slack webhook URL first.");
      if (!propertyId) throw new Error("Set a GA4 property ID.");

      // 1) Fetch core datasets (reusing hero where possible)
      const channelsParsed = latestHero?.parsed?.rows?.length
        ? latestHero.parsed
        : parseGa4Channels(await fetchJson("/api/ga4/query", { propertyId, startDate, endDate, filters }));

      const ecom = await fetchJson("/api/ga4/ecommerce-summary", { propertyId, startDate, endDate, filters });
      const kpis = ecom?.totals || {};

      const srcMed = await fetchJson("/api/ga4/source-medium", { propertyId, startDate, endDate, filters, limit: 25 });
      const srcRows = (srcMed.rows || []).map(r => ({
        source: r.dimensionValues?.[0]?.value || "(unknown)",
        medium: r.dimensionValues?.[1]?.value || "(unknown)",
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
      }));

      const pages = await fetchJson("/api/ga4/top-pages", { propertyId, startDate, endDate, filters, limit: 15 });
      const pageRows = (pages.rows || []).map((r) => ({
        title: r.dimensionValues?.[0]?.value || "(untitled)",
        path: r.dimensionValues?.[1]?.value || "",
        views: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
      }));

      // 2) Ask AI for concise summaries for each area, then assemble
      const dateRange = { start: startDate, end: endDate };
      const filtersPayload = filters;

      const [sumEcom, sumChannels, sumSrcMed, sumPages] = await Promise.all([
        fetchJson("/api/insights/summarise-pro", { topic: "ecom_kpis", totals: kpis, dateRange, filters: filtersPayload }),
        fetchJson("/api/insights/summarise-pro", { topic: "channels", rows: channelsParsed.rows, totals: channelsParsed.totals, dateRange, filters: filtersPayload }),
        fetchJson("/api/insights/summarise-pro", { topic: "source_medium", rows: srcRows, dateRange, filters: filtersPayload }),
        fetchJson("/api/insights/summarise-pro", { topic: "pages", rows: pageRows, dateRange, filters: filtersPayload }),
      ]);

      const s1 = (sumEcom?.summary || "").trim();
      const s2 = (sumChannels?.summary || "").trim();
      const s3 = (sumSrcMed?.summary || "").trim();
      const s4 = (sumPages?.summary || "").trim();

      // 3) KPI progress against stored targets
      const t = loadKpiTargets();
      const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(2)}%` : "0.00%");
      const progress = [
        `Targets progress:`,
        `• Sessions ${(pctToTarget(kpis.sessions || 0, Number(t.sessionsTarget)) ?? 0)}%`,
        `• Revenue ${(pctToTarget(kpis.revenue || 0, Number(t.revenueTarget)) ?? 0)}%`,
        `• CVR target ${pct(Number(t.cvrTarget || 0))}`,
      ].join("\n");

      // 4) Slack payload: compact single message
      const header = `*Performance Digest*  (${startDate} → ${endDate})`;
      const sections = [header, "", s1, "", s2, "", s3, "", s4, "", progress].filter(Boolean).join("\n");

      const payload = { text: sections };
      const resp = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(`Slack responded ${resp.status}`);

      setStatus("Sent digest to Slack ✓");
    } catch (e) {
      setStatus(`Error: ${String(e.message || e)}`);
    }
  }

  return (
    <section style={{ marginTop: 28, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Performance Digest (Slack) — Premium</h3>
        {!premiumActive && <span style={{ color: "#b00020" }}>Premium required</span>}
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>Enable digest&nbsp;
            <input
              type="checkbox"
              checked={!!digestEnabled}
              onChange={(e)=>persist({ ...alertsCfg, digestEnabled: e.target.checked })}
            />
          </label>

          <label>Frequency&nbsp;
            <select
              value={digestFrequency}
              onChange={(e)=>persist({ ...alertsCfg, digestFrequency: e.target.value })}
              style={{ padding: 6 }}
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>

          <label>Time (HH:MM)&nbsp;
            <input
              value={`${String(digestHour).padStart(2,"0")}:${String(digestMinute).padStart(2,"0")}`}
              onChange={(e) => {
                const [hh, mm] = (e.target.value || "09:00").split(":").map(n => Number(n||0));
                persist({ ...alertsCfg, digestHour: hh, digestMinute: mm });
              }}
              style={{ padding: 6, width: 100 }}
            />
          </label>

          {digestFrequency === "weekly" && (
            <label>Weekday&nbsp;
              <select
                value={digestDow}
                onChange={(e)=>persist({ ...alertsCfg, digestDow: Number(e.target.value) })}
                style={{ padding: 6 }}
              >
                <option value={1}>Mon</option>
                <option value={2}>Tue</option>
                <option value={3}>Wed</option>
                <option value={4}>Thu</option>
                <option value={5}>Fri</option>
                <option value={6}>Sat</option>
                <option value={7}>Sun</option>
              </select>
            </label>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>Slack Webhook&nbsp;
            <input
              value={webhook}
              onChange={(e)=>persist({ ...alertsCfg, slackWebhook: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
              style={{ padding: 8, minWidth: 360 }}
            />
          </label>
          <button onClick={sendDigestNow} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!premiumActive || !propertyId}>
            Send test digest to Slack
          </button>
          {status && <span style={{ color: status.startsWith("Error") ? "#b00020" : "#137333" }}>{status}</span>}
        </div>
      </div>

      <p style={{ color: "#666", fontSize: 12, marginTop: 8 }}>
        The digest compiles KPIs, top channels/sources, and top pages with AI suggestions. Use Vercel Cron to call a server route if you want fully automated scheduling later. This panel is premium-gated and uses the same webhook as Anomaly Alerts.
      </p>
    </section>
  );
}

/* =========================================================================
   End of file
   ========================================================================= */
