/* eslint-disable @next/next/no-img-element */

// pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================================
   Utilities & Shared Helpers
   ========================================================================== */

/** ---------- Premium check (no new deps) ----------
 * Ways to enable premium for testing (front-end only):
 *   1) In browser console: localStorage.setItem("insightgpt_premium", "1")
 *   2) Or set window.__IS_PREMIUM__ = true (e.g. in DevTools)
 *   3) Or add ?premium=1 to the URL (first load stores it)
 */
function isPremium() {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("premium") === "1") {
      localStorage.setItem("insightgpt_premium", "1");
      url.searchParams.delete("premium");
      window.history.replaceState(null, "", url.toString());
    }
  } catch {}
  const flag = (() => {
    try { return localStorage.getItem("insightgpt_premium") === "1"; } catch { return false; }
  })();
  return Boolean(
    (typeof window !== "undefined" && window.__IS_PREMIUM__ === true) ||
    flag
  );
}

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

/** -------- LocalStorage keys (must remain) -------- */
const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";
const KPI_KEY = "insightgpt_kpi_targets_v1";
const ALERTS_KEY = "insightgpt_alerts_cfg_v1";

/** -------- KPI Targets helpers & badge (persisted, backward compatible) --------
 * Stored as (any missing keys are allowed):
 *   { sessionsTarget:number, revenueTarget:number, cvrTarget:number }
 */
function loadKpiTargets() {
  try {
    const raw = localStorage.getItem(KPI_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return typeof obj === "object" && obj ? obj : {};
  } catch {
    return {};
  }
}
function saveKpiTargets(obj) {
  try { localStorage.setItem(KPI_KEY, JSON.stringify(obj || {})); } catch {}
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

/** -------- Alerts config (persisted) --------
 * Stored under ALERTS_KEY:
 *   {
 *     enabled: boolean,
 *     metrics: { sessions: boolean, revenue: boolean, cvr: boolean },
 *     sensitivityZ: number,   // Z-score threshold (e.g., 2.0 ~ 97.5% tail)
 *     lookbackDays: number,   // sample window to estimate baseline
 *     slack: { enabled: boolean, webhook: string }   // NEW (premium)
 *   }
 */
function defaultAlertsCfg() {
  return {
    enabled: false,
    metrics: { sessions: true, revenue: true, cvr: true },
    sensitivityZ: 2.0,
    lookbackDays: 28,
    slack: { enabled: false, webhook: "" },
  };
}
function loadAlertsCfg() {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return defaultAlertsCfg();
    const obj = JSON.parse(raw);
    const base = defaultAlertsCfg();
    return {
      ...base,
      ...(obj || {}),
      metrics: { ...base.metrics, ...(obj?.metrics || {}) },
      slack: { ...base.slack, ...(obj?.slack || {}) },
    };
  } catch {
    return defaultAlertsCfg();
  }
}
function saveAlertsCfg(cfg) {
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(cfg || defaultAlertsCfg())); } catch {}
}

/** GA4 UI Lists */
const COUNTRY_OPTIONS = [
  "All","United Kingdom","United States","Ireland","Germany","France","Spain","Italy","Netherlands","Australia","Canada","India",
];
const CHANNEL_GROUP_OPTIONS = [
  "All","Direct","Organic Search","Paid Search","Organic Social","Paid Social","Email","Referral","Display","Video","Affiliates","Organic Shopping","Paid Shopping",
];

/** Quick helpers */
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
  const days = Math.round((end - start) / oneDay) + 1;
  const prevEnd = new Date(start.getTime() - oneDay);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * oneDay);
  return { prevStart: ymd(prevStart), prevEnd: ymd(prevEnd) };
}

/** CSV builders */
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

/** QuickChart pie URL */
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

/* ============================================================================
   Main Page
   ========================================================================== */
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

  // Saved KPI & Alerts UI modals
  const [showKpiPanel, setShowKpiPanel] = useState(false);

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
    setAppliedFilters({ country: countrySel, channelGroup: channelSel });
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

  // Slack Delivery (client-side, no-cors). Works best as MVP; for production, proxy via /api.
  async function postToSlack(webhook, payload) {
    if (!webhook) throw new Error("Missing Slack webhook URL.");
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "no-cors", // Slack webhooks do not send CORS headers; this still delivers the message
        body: JSON.stringify(payload || {}),
      });
      return { ok: true, message: "Sent (no-cors)" };
    } catch (e) {
      throw new Error(e?.message || "Failed to POST to Slack webhook.");
    }
  }

  // "Send report now" action -> builds a quick summary and posts to Slack
  const [sendNowBusy, setSendNowBusy] = useState(false);
  const sendReportNowToSlack = async () => {
    const premium = isPremium();
    if (!premium) { alert("Premium feature. Enable premium to use Slack delivery."); return; }

    const alertsCfg = loadAlertsCfg();
    if (!alertsCfg?.slack?.enabled || !alertsCfg?.slack?.webhook) {
      alert("Slack delivery is disabled or webhook URL is missing. Open Anomaly Alerts and configure Slack.");
      return;
    }
    if (!propertyId) { alert("Enter a GA4 Property ID first."); return; }

    setSendNowBusy(true);
    try {
      // Generate a short AI summary of the current hero rows as a quick MVP
      const summaryPayload = {
        topic: "executive-report",
        dateRange: { start: startDate, end: endDate },
        filters: appliedFilters,
        hero: {
          totals: { sessions: totals.sessions, users: totals.users },
          topChannel: top?.channel || "",
          topShare,
        },
        instructions:
          "Create a concise executive summary (3-6 bullets) of traffic performance for the selected period. " +
          "Call out top channel and % share. Add 2 hypotheses & 2 next tests.",
      };
      let summaryText = "";
      try {
        const ai = await fetchJson("/api/insights/summarise-pro", summaryPayload);
        summaryText = ai?.summary || "";
      } catch {
        summaryText =
          `Summary for ${startDate} → ${endDate}\n` +
          `Sessions: ${totals.sessions.toLocaleString()} | Users: ${totals.users.toLocaleString()}\n` +
          (top ? `Top Channel: ${top.channel} (${topShare}% share)\n` : "");
      }

      const text =
        `*InsightGPT Report*  \n` +
        `Property: \`${propertyId}\`  \n` +
        `Range: ${startDate} → ${endDate}  \n` +
        (appliedFilters?.country !== "All" || appliedFilters?.channelGroup !== "All"
          ? `Filters: ${appliedFilters?.country || "All"} · ${appliedFilters?.channelGroup || "All"}  \n`
          : "") +
        `\n${summaryText}`;

      await postToSlack(alertsCfg.slack.webhook, { text });
      alert("Report sent to Slack.");
    } catch (e) {
      alert(`Slack send failed: ${e.message}`);
    } finally {
      setSendNowBusy(false);
    }
  };

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
          {loading ? "Running\u2026" : "Run GA4 Report"}
        </button>

        <button
          onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={!rows.length}
          title={rows.length ? "Download table as CSV" : "Run a report first"}
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
            Filters apply when you run a section (e.g., GA4 Report / Load buttons).
          </span>

          {/* KPI Targets panel toggle */}
          <button
            onClick={() => setShowKpiPanel(s => !s)}
            style={{ padding: "6px 10px", cursor: "pointer", marginLeft: "auto" }}
            aria-expanded={showKpiPanel}
            aria-controls="kpi-panel"
            title="Set KPI targets"
          >
            {showKpiPanel ? "Hide KPI Targets" : "Set KPI Targets"}
          </button>

          {/* Premium: Send report now to Slack */}
          <button
            onClick={sendReportNowToSlack}
            style={{ padding: "6px 10px", cursor: "pointer" }}
            disabled={sendNowBusy}
            title="Premium: sends a concise report summary to Slack"
          >
            {sendNowBusy ? "Sending\u2026" : "Send Report Now (Slack \u2605)"}
          </button>
        </div>

        {showKpiPanel && <KpiTargetsPanel />}
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
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>
        </section>
      )}

      {/* Anomaly Alerts (Premium) */}
      <AnomalyAlerts
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        onSlackPost={postToSlack}
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

/* ============================================================================
   Reusable AI block
   ========================================================================== */
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
        {loading ? "Summarising\u2026" : (asButton ? buttonLabel : "Summarise with AI")}
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

/* ============================================================================
   KPI Targets Panel (persisted)
   ========================================================================== */
function KpiTargetsPanel() {
  const [kpi, setKpi] = useState(() => loadKpiTargets());
  const [saved, setSaved] = useState("");

  const save = () => {
    const obj = {
      sessionsTarget: Number(kpi?.sessionsTarget || 0) || 0,
      revenueTarget: Number(kpi?.revenueTarget || 0) || 0,
      cvrTarget: Number(kpi?.cvrTarget || 0) || 0,
    };
    saveKpiTargets(obj);
    setKpi(obj);
    setSaved("Saved!");
    setTimeout(() => setSaved(""), 1200);
  };

  return (
    <div id="kpi-panel" style={{ marginTop: 12, padding: 12, border: "1px dashed #e0e0e0", borderRadius: 8, background: "#fbfbfb" }}>
      <h3 style={{ margin: "0 0 8px" }}>KPI Targets</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label htmlFor="kpi-sessions">Sessions target&nbsp;
          <input
            id="kpi-sessions"
            inputMode="numeric"
            value={kpi?.sessionsTarget ?? ""}
            onChange={(e) => setKpi({ ...kpi, sessionsTarget: e.target.value })}
            placeholder="e.g. 100000"
            style={{ padding: 8, width: 160 }}
          />
        </label>
        <label htmlFor="kpi-revenue">Revenue target (GBP)&nbsp;
          <input
            id="kpi-revenue"
            inputMode="decimal"
            value={kpi?.revenueTarget ?? ""}
            onChange={(e) => setKpi({ ...kpi, revenueTarget: e.target.value })}
            placeholder="e.g. 50000"
            style={{ padding: 8, width: 160 }}
          />
        </label>
        <label htmlFor="kpi-cvr">CVR target (%)&nbsp;
          <input
            id="kpi-cvr"
            inputMode="decimal"
            value={kpi?.cvrTarget ?? ""}
            onChange={(e) => setKpi({ ...kpi, cvrTarget: e.target.value })}
            placeholder="e.g. 2.5"
            style={{ padding: 8, width: 120 }}
          />
        </label>
        <button onClick={save} style={{ padding: "8px 12px", cursor: "pointer" }}>Save targets</button>
        {saved && <span style={{ color: "#137333" }}>{saved}</span>}
      </div>
      <p style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
        Badges across the dashboard show progress vs targets (e.g., Sessions). CVR target is used for comparison where applicable.
      </p>
    </div>
  );
}

/* ============================================================================
   Anomaly Alerts (Premium) with Slack delivery
   ========================================================================== */
function AnomalyAlerts({ propertyId, startDate, endDate, filters, onSlackPost }) {
  const premium = isPremium();
  const [cfg, setCfg] = useState(defaultAlertsCfg);
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState([]); // [{metric, period, z, value, mean, sd}]
  const [error, setError] = useState("");

  useEffect(() => {
    setCfg(loadAlertsCfg());
  }, []);

  const persist = (next) => {
    setCfg(next);
    saveAlertsCfg(next);
  };

  // Simple time-series fetcher (sessions, revenue, cvr) using existing API
  async function fetchSeries(granularity) {
    const data = await fetchJson("/api/ga4/timeseries", {
      propertyId, startDate, endDate, filters, granularity,
    });
    const rows = data?.series || [];
    // Project missing fields robustly
    return rows.map(r => ({
      period: r.period,
      sessions: Number(r.sessions || 0),
      revenue: Number(r.revenue || 0),
      cvr: Number(r.sessions > 0 ? ((Number(r.transactions || 0) / Number(r.sessions || 1)) * 100) : 0),
    }));
  }

  // Compute z-scores on trailing window
  function detect(series, metric, lookback, zThresh) {
    const out = [];
    for (let i = 0; i < series.length; i++) {
      const startIdx = Math.max(0, i - lookback);
      const window = series.slice(startIdx, i); // exclude current point
      if (window.length < Math.max(5, Math.floor(lookback * 0.5))) continue; // need minimal baseline
      const values = window.map(d => Number(d[metric] || 0));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(
        values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, values.length - 1)
      ) || 0;
      const v = Number(series[i][metric] || 0);
      const z = sd > 0 ? (v - mean) / sd : 0;
      if (Math.abs(z) >= zThresh) {
        out.push({ metric, period: series[i].period, value: v, mean, sd, z });
      }
    }
    return out;
  }

  const run = async () => {
    if (!premium) { alert("Premium feature. Enable premium to run anomaly alerts."); return; }
    if (!cfg.enabled) { alert("Alerts are disabled. Enable in the panel first."); return; }
    if (!propertyId) { alert("Enter a GA4 Property ID first."); return; }

    setBusy(true); setError(""); setAlerts([]);
    try {
      const series = await fetchSeries("daily");
      let found = [];
      if (cfg.metrics.sessions) found = found.concat(detect(series, "sessions", cfg.lookbackDays, cfg.sensitivityZ));
      if (cfg.metrics.revenue)  found = found.concat(detect(series, "revenue",  cfg.lookbackDays, cfg.sensitivityZ));
      if (cfg.metrics.cvr)      found = found.concat(detect(series, "cvr",      cfg.lookbackDays, cfg.sensitivityZ));
      found.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
      setAlerts(found);

      // Optional: auto-post to Slack when findings exist and Slack enabled
      if (found.length && cfg.slack?.enabled && cfg.slack?.webhook) {
        const lines = found.slice(0, 10).map(a => {
          const sign = a.z >= 0 ? "+" : "\u2212";
          const zAbs = Math.abs(a.z).toFixed(2);
          const val = a.metric === "revenue"
            ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(a.value || 0)
            : (a.metric === "cvr" ? `${a.value.toFixed(2)}%` : a.value.toLocaleString());
          return `• *${a.metric.toUpperCase()}* ${sign}${zAbs}\u03C3 on ${a.period} — value ${val}`;
        }).join("\n");

        const text =
          `*Anomalies detected* (Property \`${propertyId}\`, ${startDate} → ${endDate})\n` +
          (filters?.country !== "All" || filters?.channelGroup !== "All"
            ? `Filters: ${filters?.country || "All"} · ${filters?.channelGroup || "All"}\n` : "") +
          `Z\u2265${cfg.sensitivityZ}, lookback ${cfg.lookbackDays} days\n\n${lines}`;

        try { await onSlackPost(cfg.slack.webhook, { text }); } catch {}
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const testSlack = async () => {
    if (!premium) { alert("Premium feature. Enable premium to test Slack."); return; }
    const hook = cfg?.slack?.webhook?.trim();
    if (!hook) { alert("Enter your Slack Incoming Webhook URL first."); return; }
    try {
      await onSlackPost(hook, { text: "InsightGPT test: Slack delivery is configured \u2705" });
      alert("Test message sent to Slack.");
    } catch (e) {
      alert(`Slack test failed: ${e.message}`);
    }
  };

  return (
    <section style={{ marginTop: 24, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Anomaly Alerts {premium ? <span style={{ fontWeight: 400, color: "#666" }}>(Premium)</span> : <span style={{ fontWeight: 400, color: "#b00020" }}>(Locked)</span>}</h3>
        <label htmlFor="alerts-enabled" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
          <input
            id="alerts-enabled"
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={(e) => persist({ ...cfg, enabled: e.target.checked })}
            disabled={!premium}
          />
          Enable alerts
        </label>

        <button onClick={run} style={{ padding: "6px 10px", cursor: "pointer" }} disabled={!premium || !cfg.enabled || !propertyId || busy} title={!premium ? "Premium feature" : ""}>
          {busy ? "Scanning\u2026" : "Scan for anomalies"}
        </button>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <b>Metrics:</b>
          {["sessions","revenue","cvr"].map(m => (
            <label key={m} htmlFor={`m-${m}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                id={`m-${m}`}
                type="checkbox"
                checked={!!cfg.metrics?.[m]}
                onChange={(e) => persist({ ...cfg, metrics: { ...cfg.metrics, [m]: e.target.checked } })}
                disabled={!premium}
              />
              {m.toUpperCase()}
            </label>
          ))}

          <label htmlFor="sens" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            Sensitivity (z)
            <input
              id="sens"
              type="number"
              step="0.1"
              min="1"
              value={cfg.sensitivityZ}
              onChange={(e) => persist({ ...cfg, sensitivityZ: Number(e.target.value || 2) })}
              style={{ width: 80, padding: 6 }}
              disabled={!premium}
            />
          </label>

          <label htmlFor="lookback" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Lookback days
            <input
              id="lookback"
              type="number"
              min="7"
              value={cfg.lookbackDays}
              onChange={(e) => persist({ ...cfg, lookbackDays: Number(e.target.value || 28) })}
              style={{ width: 90, padding: 6 }}
              disabled={!premium}
            />
          </label>
        </div>

        {/* Slack delivery (premium) */}
        <div style={{ padding: 10, border: "1px dashed #e0e0e0", borderRadius: 8, background: "#fbfbfb" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b>Slack Delivery:</b>
            <label htmlFor="slack-enabled" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                id="slack-enabled"
                type="checkbox"
                checked={!!cfg.slack?.enabled}
                onChange={(e) => persist({ ...cfg, slack: { ...cfg.slack, enabled: e.target.checked } })}
                disabled={!premium}
              />
              Enable Slack
            </label>
            <label htmlFor="slack-hook" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Webhook URL
              <input
                id="slack-hook"
                type="url"
                inputMode="url"
                placeholder="https://hooks.slack.com/services/XXXX/XXXX/XXXX"
                value={cfg.slack?.webhook || ""}
                onChange={(e) => persist({ ...cfg, slack: { ...cfg.slack, webhook: e.target.value } })}
                style={{ minWidth: 360, padding: 6 }}
                disabled={!premium}
              />
            </label>
            <button onClick={testSlack} style={{ padding: "6px 10px", cursor: "pointer" }} disabled={!premium}>
              Send test
            </button>
          </div>
          <p style={{ marginTop: 6, color: "#666", fontSize: 12 }}>
            Slack messages are posted via Incoming Webhooks. In a production setup, proxy this via a server endpoint to avoid browser CORS.
          </p>
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 10, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {alerts.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Metric</th>
                <th style={{ textAlign: "left",  borderBottom: "1px solid #ddd", padding: 8 }}>Period</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Value</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Mean</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>SD</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Z</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={`${a.metric}-${a.period}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{a.metric.toUpperCase()}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{a.period}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {a.metric === "revenue"
                      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(a.value || 0)
                      : (a.metric === "cvr" ? `${(a.value || 0).toFixed(2)}%` : (a.value || 0).toLocaleString())}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {a.metric === "revenue"
                      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(a.mean || 0)
                      : (a.metric === "cvr" ? `${(a.mean || 0).toFixed(2)}%` : (a.mean || 0).toLocaleString())}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {(a.sd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee", color: Math.abs(a.z) >= (cfg?.sensitivityZ || 2) ? "#b00020" : "#333" }}>
                    {a.z.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No anomalies listed yet. Click \u201cScan for anomalies\u201d.</p>)}
    </section>
  );
}

/* ============================================================================
   Source / Medium
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load Source / Medium"}
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

/* ============================================================================
   Campaigns (overview)
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load Campaigns"}
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

/* ============================================================================
   Campaign drill-down
   ========================================================================== */
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
          placeholder="Type exact campaign name\u2026"
          style={{ padding: 8, minWidth: 260 }}
        />
        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId || !campaign}>
          {loading ? "Loading\u2026" : "Load Campaign Details"}
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
          <b>Totals for \u201c{campaign}\u201d:</b>{" "}
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
        <p style={{ marginTop: 8, color: "#666" }}>Enter a campaign name and click \u201cLoad Campaign Details\u201d.</p>
      )}
    </section>
  );
}

/* ============================================================================
   Campaigns Overview
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load Campaigns"}
        </button>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign name\u2026" style={{ padding: 8, minWidth: 220 }} />

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

/* ============================================================================
   Top Pages
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load Top Pages"}
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

/* ============================================================================
   Landing Pages × Attribution
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load Landing Pages"}
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
        <label htmlFor="lp-top-only" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input id="lp-top-only" type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} />
          Top entries only (25)
        </label>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 260 }}>
          <span style={{ fontSize: 13, color: "#333" }}>Min sessions</span>
          <input
            id="lp-min-sessions"
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

/* ============================================================================
   E-commerce KPIs
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load E-commerce KPIs"}
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

/* ============================================================================
   Checkout Funnel
   ========================================================================== */
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
          {loading ? "Loading\u2026" : "Load Checkout Funnel"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-funnel"
          payload={{ steps, dateRange: { start: startDate, end: endDate }, filters }}
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

/* ============================================================================
   Trends Over Time
   ========================================================================== */
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
    return `${startStr}\u2013${endStr}`;
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

        <label htmlFor="granular" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Granularity
          <select id="granular" value={granularity} onChange={(e) => setGranularity(e.target.value)} style={{ padding: 6 }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <button onClick={load} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
          {loading ? "Loading\u2026" : "Load Trends"}
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
              "Recommend 2\u20133 next actions or tests",
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

      {error && <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows)}
              alt="Sessions &amp; Users trend"
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

/* ============================================================================
   Product Performance (flag: NEXT_PUBLIC_ENABLE_PRODUCTS === "true")
   ========================================================================== */
function Products({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);            // [{ name, id, views, carts, purchases, revenue }]
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);        // raw GA4 response

  useEffect(() => {
    setRows([]); setError(""); setDebug(null);
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
        key: `p-${idx}`, name,
        id: iItemId >= 0 ? (r.dimensionValues?.[iItemId]?.value || "") : "",
        views, carts, purchases, revenue,
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
        name: r.name, id: r.id, views: r.views, carts: r.carts, purchases: r.purchases, revenue: r.revenue,
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
          {loading ? "Loading\u2026" : "Load Products"}
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
              name: r.name, id: r.id, views: r.views, carts: r.carts, purchases: r.purchases, revenue: r.revenue,
            })),
            instructions:
              "Identify SKUs with high views but low add-to-carts or purchases. Call out likely issues (pricing, imagery, PDP UX). Provide 2\u20133 testable hypotheses to improve add-to-cart rate and conversion.",
          }}
          resetSignal={resetSignal}
        />

        <button onClick={exportCsv} style={{ padding: "8px 12px", cursor: "pointer" }} disabled={!rows.length}>
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
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>{r.id || "\u2014"}</td>
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
      ) : (!error && <p style={{ marginTop: 8, color: "#666" }}>No rows loaded yet.</p>)}

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

/* ============================================================================
   Saved Views
   ========================================================================== */
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
          placeholder="Name this view (e.g. UK \u00B7 Organic \u00B7 Sep)"
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
                  {p.startDate} \u2192 {p.endDate} \u00B7 {p.country} \u00B7 {p.channelGroup} {p.comparePrev ? "\u00B7 compare" : ""}
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
          No saved views yet. Set dates/filters, give it a name, then \u201cSave current\u201d.
        </p>
      )}
    </section>
  );
}

/* ============================================================================
   Helpers (channels)
   ========================================================================== */
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
