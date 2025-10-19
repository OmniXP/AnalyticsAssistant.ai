/* eslint-disable @next/next/no-img-element */

// /pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

/* ============================== Theme (ORB-inspired + Google hues) ============================== */
const COLOR = {
  googleBlue: "#4285F4",
  googleRed: "#EA4335",
  googleGreen: "#34A853",
  frostedBg: "rgba(255,255,255,0.75)",
  frostedBorder: "rgba(255,255,255,0.35)",
  cardBorder: "#e9eef5",
  text: "#0f172a",
  textMuted: "#475569",
  panel: "#f8fafc",
  panelDark: "#eef2f7",
};

/* ============================== Premium Helper (unchanged contract) ============================== */
/**
 * Premium gate is UI-only; keep behavior the same as you’ve been testing.
 * - If localStorage.insightgpt_premium_override === "1" => premium
 * - Else if NEXT_PUBLIC_PREMIUM_DEFAULT === "true" => premium (for internal testing)
 * - Otherwise not premium
 */
function isPremiumUser() {
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem("insightgpt_premium_override") === "1") return true;
    } catch {}
  }
  if (process.env.NEXT_PUBLIC_PREMIUM_DEFAULT === "true") return true;
  return false;
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
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        background: ok ? "rgba(52,168,83,0.10)" : "rgba(234,67,53,0.10)",
        color: ok ? COLOR.googleGreen : COLOR.googleRed,
        border: `1px solid ${ok ? "rgba(52,168,83,0.25)" : "rgba(234,67,53,0.25)"}`,
        whiteSpace: "nowrap",
      }}
    >
      {`${pct}% to ${label} target`}
    </span>
  );
}

/* -------- Options -------- */
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

/* -------- GA4: Parse Channels -------- */
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

/* -------- Formatting -------- */
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

/* -------- CSV -------- */
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

/* -------- Charts (QuickChart) -------- */
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
function buildLineChartUrl(series, granularity = "daily") {
  if (!series?.length) return "";
  const labels = series.map((d) =>
    granularity === "weekly" ? formatYearWeekRange(d.period) : formatYYYYMMDD(d.period)
  );
  const sessions = series.map((d) => d.sessions);
  const users = series.map((d) => d.users);
  const cfg = {
    type: "line",
    data: { labels, datasets: [{ label: "Sessions", data: sessions }, { label: "Users", data: users }] },
    options: { plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true } } },
  };
  return `https://quickchart.io/chart?w=800&h=360&c=${encodeURIComponent(JSON.stringify(cfg))}`;
}

/* -------- Dates for timeseries -------- */
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

/* -------- Unified fetch + client cache + abort/backoff -------- */
const _clientCache = new Map(); // key -> { t: ms, data }
const CACHE_TTL_MS = 5 * 60 * 1000;
let _inflight = null;
let _ac = null;

async function fetchJson(url, payload) {
  const key = `${url}::${JSON.stringify(payload || {})}`;
  const now = Date.now();
  const cached = _clientCache.get(key);
  if (cached && now - cached.t < CACHE_TTL_MS) return cached.data;

  if (_ac) _ac.abort(); // abort previous if any
  _ac = new AbortController();

  // simple backoff try
  const tries = [0, 200, 600];
  let lastErr = null;
  for (let i = 0; i < tries.length; i++) {
    if (tries[i]) await new Promise((r) => setTimeout(r, tries[i]));
    try {
      _inflight = fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
        signal: _ac.signal,
      });
      const res = await _inflight;
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
      const out = data || {};
      _clientCache.set(key, { t: now, data: out });
      return out;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error("Request failed");
}

/* -------- Debug stringify -------- */
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

  // Onboarding (first-run wizard)
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [obStep, setObStep] = useState(0); // 0: property/date, 1: KPIs, 2: premium (alerts/digest)
  const onboardingRefusedKey = "insightgpt_onboarded_v1";

  // Sticky: scroll default channel group into view right after Run
  const heroRef = useRef(null);

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

  // Load preset once + decide if onboarding should show
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

    try {
      const dismissed = localStorage.getItem(onboardingRefusedKey) === "1";
      if (!dismissed) {
        // Heuristics: show wizard if no property or no KPI targets saved
        const hasProperty = !!(document?.getElementById("property-id")?.value || "");
        const kpi = loadKpiTargets();
        const missingKpi =
          !(Number(kpi.sessionsTarget) > 0) ||
          !(Number(kpi.revenueTarget) > 0) ||
          !(Number(kpi.cvrTarget) > 0);
        if (!hasProperty || missingKpi) {
          setShowOnboarding(true);
          setObStep(!hasProperty ? 0 : 1); // start on the first incomplete step
        }
      }
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

      // Scroll hero (Traffic by Default Channel Group) into view to acknowledge action
      setTimeout(() => {
        try {
          heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {}
      }, 50);
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

  const premium = isPremiumUser();

  return (
    <main
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
        color: COLOR.text,
      }}
    >
      {/* Sticky header (compact on mobile) */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "saturate(180%) blur(10px)",
          background: COLOR.frostedBg,
          borderBottom: `1px solid ${COLOR.frostedBorder}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "10px 8px", gap: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Image src="/logo.svg" alt="InsightGPT" width={24} height={24} priority />
            <span style={{ fontWeight: 600 }}>InsightGPT (MVP)</span>
          </div>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <a href="#hero-channels" style={navLinkStyle}>Channels</a>
            <a href="#top-pages" style={navLinkStyle}>Top pages</a>
            <a href="#source-medium" style={navLinkStyle}>Source/Medium</a>
            <a href="#ecom-kpis" style={navLinkStyle}>E-com KPIs</a>
            <a href="#checkout-funnel" style={navLinkStyle}>Checkout</a>
            <a href="#trends" style={navLinkStyle}>Trends</a>
            <a href="#campaigns" style={navLinkStyle}>Campaigns</a>
          </nav>
        </div>
      </header>

      {/* Title + context */}
      <div style={{ marginTop: 12, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Analytics & Insights</h1>
        <p style={{ marginTop: 6, color: COLOR.textMuted, fontSize: 14 }}>
          Connect GA4, choose a date range, optionally apply filters, and view traffic & insights.
        </p>
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          background: COLOR.panel,
          border: `1px solid ${COLOR.cardBorder}`,
          borderRadius: 12,
          padding: 12,
        }}
        aria-label="Global controls"
      >
        <button onClick={connect} style={btnSecondary} title="Connect your Google Analytics property">
          Connect Google Analytics
        </button>

        <label title="Find your GA4 property id in Admin \u2192 Property Settings">
          GA4 Property ID&nbsp;
          <input
            id="property-id"
            name="property-id"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            style={inputStyle}
          />
        </label>

        <label title="Inclusive start date for the report">Start date&nbsp;
          <input id="start-date" name="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
        </label>
        <label title="Inclusive end date for the report">End date&nbsp;
          <input id="end-date" name="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
        </label>

        <button onClick={runReport} style={btnPrimary(loading || !propertyId)} disabled={loading || !propertyId} aria-label="Run GA4 report">
          {loading ? "Running…" : "Run GA4 Report"}
        </button>

        <button
          onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
          style={btnSecondary}
          disabled={!rows.length}
          title={rows.length ? "Download channel table as CSV" : "Run a report first"}
        >
          Download CSV
        </button>

        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8, borderLeft: `1px solid ${COLOR.cardBorder}` }}>
          <input id="compare-prev" type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          Compare vs previous period
        </label>

        <button onClick={resetDashboard} style={{ ...btnSecondary, marginLeft: "auto" }} title="Reset dates & filters (keeps property id)">
          Reset Dashboard
        </button>
      </div>

      {/* Filters */}
      <div style={{ marginTop: 12, padding: 12, border: `1px solid ${COLOR.cardBorder}`, borderRadius: 12, background: COLOR.panel }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>Filters:</b>
          <label>Country&nbsp;
            <select id="country-filter" value={countrySel} onChange={(e) => setCountrySel(e.target.value)} style={inputStyle}>
              {COUNTRY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <label>Channel Group&nbsp;
            <select id="channel-filter" value={channelSel} onChange={(e) => setChannelSel(e.target.value)} style={inputStyle}>
              {CHANNEL_GROUP_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </label>
          <button onClick={applyFilters} style={btnSecondary}>Apply filters</button>
          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span style={{ background: "rgba(66,133,244,0.10)", color: COLOR.googleBlue, padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
              {`Filters active: `}
              {appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}
              {appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}
              {appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}
            </span>
          )}
          <span style={{ color: COLOR.textMuted, fontSize: 12 }}>
            Filters apply when you run a section (e.g., GA4 Report / Load buttons).
          </span>
        </div>
      </div>

      {/* Saved Views (kept; gating unchanged, still uses SAVED_VIEWS_KEY) */}
      <SavedViews
        premiumRequired
        isPremium={premium}
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

      {/* KPI Targets & Alerts / Digest (UI only, premium gate intact) */}
      <KpiTargetsAndAlerts premiumRequired isPremium={premium} refreshSignal={refreshSignal} />

      {error && <p style={{ color: COLOR.googleRed, marginTop: 16 }}>Error: {error}</p>}

      {/* ===== Hero: Traffic by Default Channel Group (anchored & auto-scrolled) ===== */}
      <div ref={heroRef} id="hero-channels" />

      {rows.length > 0 && (
        <section
          aria-labelledby="sec-channels"
          style={cardStyle}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 id="sec-channels" style={{ margin: 0 }}>Traffic by Default Channel Group</h2>
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
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thLeft}>Channel</th>
                  <th style={thRight}>Sessions</th>
                  <th style={thRight}>Users</th>
                  <th style={thRight}>% of Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                  return (
                    <tr key={r.channel}>
                      <td style={tdLeft}>{r.channel}</td>
                      <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                      <td style={tdRight}>{r.users.toLocaleString()}</td>
                      <td style={tdRight}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16 }}>
            {/* next/image only supports known/static hosts; QuickChart is external.
                Keep <img> here but it's a single, optional preview (warning is OK). */}
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: `1px solid ${COLOR.cardBorder}`, borderRadius: 8 }}
            />
          </div>
        </section>
      )}

      {/* ============================== SECTION ORDER (requested) ============================== */}

      {/* 1) Top pages (views) */}
      <TopPages
        key={`tp-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 2) Source / Medium */}
      <SourceMedium
        key={`sm-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 3) E-commerce KPIs */}
      <EcommerceKPIs
        key={`ekpi-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 4) Checkout funnel */}
      <CheckoutFunnel
        key={`cf-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 6) Trends over time — Premium */}
      <PremiumGate isPremium={premium} label="Trends over time">
        <TrendsOverTime
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      {/* 7) Campaigns — Premium */}
      <PremiumGate isPremium={premium} label="Campaigns">
        <Campaigns
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      {/* 8) Campaign drill-down — Premium */}
      <PremiumGate isPremium={premium} label="Campaign drill-down">
        <CampaignDrilldown
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      {/* 9) Campaigns (KPI metrics) — Premium (renamed) */}
      <PremiumGate isPremium={premium} label="Campaigns (KPI metrics)">
        <CampaignsOverview
          titleOverride="Campaigns (KPI metrics)"
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      {/* 10) Landing Pages × Attribution — Premium */}
      <PremiumGate isPremium={premium} label="Landing Pages × Attribution">
        <LandingPages
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      {/* Products (feature flag) */}
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

      {/* Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingModal
          step={obStep}
          setStep={setObStep}
          close={() => { try { localStorage.setItem(onboardingRefusedKey, "1"); } catch {} setShowOnboarding(false); }}
          propertyId={propertyId}
          setPropertyId={setPropertyId}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
        />
      )}
    </main>
  );
}

/* ============================== UI atoms ============================== */
const btnPrimary = (disabled) => ({
  padding: "10px 14px",
  cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "rgba(66,133,244,0.45)" : COLOR.googleBlue,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontWeight: 600,
});
const btnSecondary = {
  padding: "10px 14px",
  cursor: "pointer",
  background: "#fff",
  color: COLOR.googleBlue,
  border: `1px solid ${COLOR.googleBlue}`,
  borderRadius: 10,
  fontWeight: 600,
};
const btnGhost = {
  padding: "8px 12px",
  cursor: "pointer",
  background: "transparent",
  color: COLOR.text,
  border: `1px solid ${COLOR.cardBorder}`,
  borderRadius: 10,
};
const inputStyle = { padding: 8, minWidth: 160, borderRadius: 8, border: `1px solid ${COLOR.cardBorder}`, background: "#fff" };
const cardStyle = {
  marginTop: 24,
  background: "#fff",
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${COLOR.cardBorder}`,
  boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
};
const navLinkStyle = {
  color: COLOR.textMuted,
  textDecoration: "none",
  fontSize: 13,
  padding: "4px 8px",
  borderRadius: 8,
  border: `1px solid ${COLOR.cardBorder}`,
  background: "#fff",
};
const tableStyle = { borderCollapse: "collapse", width: "100%", fontSize: 14 };
const thLeft = { textAlign: "left", borderBottom: `1px solid ${COLOR.cardBorder}`, padding: 8 };
const thRight = { textAlign: "right", borderBottom: `1px solid ${COLOR.cardBorder}`, padding: 8 };
const tdLeft = { padding: 8, borderBottom: `1px solid ${COLOR.panelDark}` };
const tdRight = { padding: 8, textAlign: "right", borderBottom: `1px solid ${COLOR.panelDark}` };

/* ============================== Premium Gate wrapper ============================== */
function PremiumGate({ isPremium, label, children }) {
  if (isPremium) return children;
  return (
    <section style={cardStyle} aria-label={`${label} (premium)`}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{label}</h3>
          <p style={{ margin: "6px 0 0", color: COLOR.textMuted, fontSize: 14 }}>
            Premium required to view this section.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              try { localStorage.setItem("insightgpt_premium_override", "0"); } catch {}
              alert("Premium is locked. Purchase to unlock.");
            }}
            style={btnGhost}
            aria-label="Premium required"
            title="Premium required"
          >
            Locked
          </button>
        </div>
      </div>
    </section>
  );
}

/* ============================== Onboarding Modal ============================== */
function OnboardingModal({
  step, setStep, close,
  propertyId, setPropertyId,
  startDate, setStartDate,
  endDate, setEndDate,
}) {
  const kpi = loadKpiTargets();
  const [sessionsTarget, setSessionsTarget] = useState(kpi.sessionsTarget || "");
  const [revenueTarget, setRevenueTarget] = useState(kpi.revenueTarget || "");
  const [cvrTarget, setCvrTarget] = useState(kpi.cvrTarget || "");

  const premium = isPremiumUser();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const saveKpis = () => {
    try {
      const payload = {
        sessionsTarget: Number(sessionsTarget) || 0,
        revenueTarget: Number(revenueTarget) || 0,
        cvrTarget: Number(cvrTarget) || 0,
      };
      localStorage.setItem("insightgpt_kpi_targets_v1", JSON.stringify(payload));
      alert("KPI targets saved.");
    } catch {
      alert("Could not save KPI targets.");
    }
  };

  return (
    <div style={modalWrap}>
      <div style={modalCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Welcome to InsightGPT</h3>
          <span style={{ marginLeft: "auto", fontSize: 12, color: COLOR.textMuted }}>Quick setup · 3 steps</span>
        </div>

        {/* Steps header */}
        <ol style={{ display: "flex", listStyle: "none", gap: 8, padding: 0, margin: "8px 0 14px" }}>
          {["Connect & Dates", "KPI Targets", "Premium (Alerts/Digest)"].map((label, idx) => (
            <li key={label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 22, height: 22, borderRadius: 999, display: "inline-grid", placeItems: "center",
                  background: step === idx ? COLOR.googleBlue : "#fff",
                  color: step === idx ? "#fff" : COLOR.textMuted,
                  border: `1px solid ${COLOR.cardBorder}`,
                  fontSize: 12, fontWeight: 700,
                }}
              >
                {idx + 1}
              </span>
              <span style={{ color: step === idx ? COLOR.googleBlue : COLOR.textMuted, fontSize: 13 }}>{label}</span>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div>
            <p style={{ marginTop: 0, color: COLOR.textMuted }}>
              Enter your GA4 property id and pick a default date range.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <label>GA4 Property ID
                <input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="e.g. 123456789" style={{ ...inputStyle, width: "100%" }} />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ flex: 1 }}>Start date
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
                <label style={{ flex: 1 }}>End date
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setStep(1)} style={btnPrimary(!propertyId)} disabled={!propertyId}>Continue</button>
              <button onClick={close} style={btnGhost}>Skip for now</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <p style={{ marginTop: 0, color: COLOR.textMuted }}>
              Set KPI targets to unlock progress badges across the app.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <label>Sessions target
                <input type="number" min="0" value={sessionsTarget} onChange={(e) => setSessionsTarget(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label>Revenue target (GBP)
                <input type="number" min="0" value={revenueTarget} onChange={(e) => setRevenueTarget(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
              <label>CVR target (%)
                <input type="number" min="0" step="0.01" value={cvrTarget} onChange={(e) => setCvrTarget(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={saveKpis} style={btnSecondary}>Save targets</button>
              <button onClick={() => setStep(2)} style={btnPrimary(false)}>Continue</button>
              <button onClick={close} style={btnGhost}>Skip for now</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p style={{ marginTop: 0, color: COLOR.textMuted }}>
              Slack Alerts & Performance Digest are premium features. Configure later in the KPI & Alerts panel.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ padding: "4px 8px", background: premium ? "rgba(52,168,83,0.10)" : "rgba(234,67,53,0.10)", color: premium ? COLOR.googleGreen : COLOR.googleRed, borderRadius: 999, fontSize: 12 }}>
                {premium ? "Premium active" : "Premium locked"}
              </span>
              <button onClick={() => setShowAdvanced(v => !v)} style={btnGhost} aria-expanded={showAdvanced}>
                {showAdvanced ? "Hide details" : "Show where to configure"}
              </button>
            </div>
            {showAdvanced && (
              <div style={{ marginTop: 10, fontSize: 14, color: COLOR.textMuted, lineHeight: 1.5 }}>
                Go to <b>KPI Targets & Alerts / Digest</b> section on the dashboard to set Slack webhooks, alert thresholds, and schedule.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => { try { localStorage.setItem("insightgpt_onboarded_v1", "1"); } catch {} close(); }}
                style={btnPrimary(false)}
              >
                Finish
              </button>
              <button onClick={close} style={btnGhost}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const modalWrap = {
  position: "fixed", inset: 0, zIndex: 100,
  background: "rgba(15,23,42,0.4)",
  display: "grid", placeItems: "center",
};
const modalCard = {
  width: "min(680px, 92vw)",
  background: "#fff",
  borderRadius: 16,
  border: `1px solid ${COLOR.cardBorder}`,
  padding: 16,
  boxShadow: "0 20px 60px rgba(2,6,23,0.20)",
};

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
      <button onClick={run} style={btnSecondary} disabled={loading}>
        {loading ? "Summarising…" : (asButton ? buttonLabel : "Summarise with AI")}
      </button>
      <button onClick={copy} style={btnGhost} disabled={!text}>
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: COLOR.googleRed }}>{error}</span>}
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

/* ============================== KPI Targets & Alerts / Digest (Premium UI) ============================== */
function KpiTargetsAndAlerts({ premiumRequired, isPremium, refreshSignal }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");

  // Targets
  const kpiInit = loadKpiTargets();
  const [sessionsTarget, setSessionsTarget] = useState(kpiInit.sessionsTarget || "");
  const [revenueTarget, setRevenueTarget] = useState(kpiInit.revenueTarget || "");
  const [cvrTarget, setCvrTarget] = useState(kpiInit.cvrTarget || "");

  // Alerts/Digest config
  const [cfg, setCfg] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("insightgpt_alerts_cfg_v1") || "null") || {
        slackWebhook: "",
        sensitivityZ: 2,
        lookbackDays: 28,
        metrics: { sessions: true, revenue: true, cvr: true },
        digest: { frequency: "weekly", hourUTC: 9 },
      };
    } catch {
      return {
        slackWebhook: "",
        sensitivityZ: 2,
        lookbackDays: 28,
        metrics: { sessions: true, revenue: true, cvr: true },
        digest: { frequency: "weekly", hourUTC: 9 },
      };
    }
  });

  useEffect(() => {
    // keep UI in sync if something external updates targets
    const k = loadKpiTargets();
    setSessionsTarget(k.sessionsTarget || "");
    setRevenueTarget(k.revenueTarget || "");
    setCvrTarget(k.cvrTarget || "");
  }, [refreshSignal]);

  const saveTargets = () => {
    try {
      const payload = {
        sessionsTarget: Number(sessionsTarget) || 0,
        revenueTarget: Number(revenueTarget) || 0,
        cvrTarget: Number(cvrTarget) || 0,
      };
      localStorage.setItem("insightgpt_kpi_targets_v1", JSON.stringify(payload));
      setNotice("KPI targets saved.");
      setTimeout(() => setNotice(""), 1400);
    } catch { setNotice("Could not save targets."); }
  };

  const saveCfg = () => {
    try {
      localStorage.setItem("insightgpt_alerts_cfg_v1", JSON.stringify(cfg));
      setNotice("Alerts/Digest settings saved.");
      setTimeout(() => setNotice(""), 1400);
    } catch { setNotice("Could not save settings."); }
  };

  return (
    <section style={cardStyle} aria-labelledby="kpi-alerts">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 id="kpi-alerts" style={{ margin: 0 }}>KPI Targets & Alerts / Digest</h2>
        {!isPremium && premiumRequired && (
          <span style={{ padding: "4px 8px", background: "rgba(66,133,244,0.10)", color: COLOR.googleBlue, borderRadius: 999, fontSize: 12 }}>
            Premium required
          </span>
        )}
        <button onClick={() => setOpen((v) => !v)} style={btnSecondary}>
          {open ? "Hide settings" : "Show settings"}
        </button>
        {notice && <span style={{ color: COLOR.googleGreen }}>{notice}</span>}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 18 }}>
          {/* Targets */}
          <div>
            <h3 style={{ margin: "0 0 6px" }}>KPI targets</h3>
            <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
              <label>Sessions target
                <input type="number" min="0" value={sessionsTarget} onChange={(e) => setSessionsTarget(e.target.value)} style={inputStyle} />
              </label>
              <label>Revenue target (GBP)
                <input type="number" min="0" value={revenueTarget} onChange={(e) => setRevenueTarget(e.target.value)} style={inputStyle} />
              </label>
              <label>CVR target (%)
                <input type="number" min="0" step="0.01" value={cvrTarget} onChange={(e) => setCvrTarget(e.target.value)} style={inputStyle} />
              </label>
              <div>
                <button onClick={saveTargets} style={btnSecondary}>Save targets</button>
              </div>
            </div>
          </div>

          {/* Alerts & Digest (premium-gated controls remain visible but disabled when locked) */}
          <div>
            <h3 style={{ margin: "0 0 6px" }}>Anomaly Alerts</h3>
            <p style={{ marginTop: 0, color: COLOR.textMuted, fontSize: 13 }}>
              Sensitivity (<code>z</code>): lower means more alerts; Lookback days: window for baseline.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <label>Sensitivity (z)
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.1"
                  disabled={!isPremium}
                  value={cfg.sensitivityZ}
                  onChange={(e) => setCfg({ ...cfg, sensitivityZ: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 100, opacity: isPremium ? 1 : 0.6 }}
                />
              </label>
              <label>Lookback days
                <input
                  type="number"
                  min="7"
                  max="60"
                  step="1"
                  disabled={!isPremium}
                  value={cfg.lookbackDays}
                  onChange={(e) => setCfg({ ...cfg, lookbackDays: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 110, opacity: isPremium ? 1 : 0.6 }}
                />
              </label>
              <fieldset style={{ border: "none", display: "flex", gap: 12 }}>
                <label style={{ display: "inline-flex", gap: 6 }}>
                  <input disabled={!isPremium} type="checkbox" checked={!!cfg.metrics.sessions} onChange={(e) => setCfg({ ...cfg, metrics: { ...cfg.metrics, sessions: e.target.checked } })} />
                  Sessions
                </label>
                <label style={{ display: "inline-flex", gap: 6 }}>
                  <input disabled={!isPremium} type="checkbox" checked={!!cfg.metrics.revenue} onChange={(e) => setCfg({ ...cfg, metrics: { ...cfg.metrics, revenue: e.target.checked } })} />
                  Revenue
                </label>
                <label style={{ display: "inline-flex", gap: 6 }}>
                  <input disabled={!isPremium} type="checkbox" checked={!!cfg.metrics.cvr} onChange={(e) => setCfg({ ...cfg, metrics: { ...cfg.metrics, cvr: e.target.checked } })} />
                  CVR
                </label>
              </fieldset>
            </div>
          </div>

          <div>
            <h3 style={{ margin: "0 0 6px" }}>Performance Digest (Slack)</h3>
            <div style={{ display: "grid", gap: 8, maxWidth: 560 }}>
              <label>Slack Webhook URL
                <input
                  type="url"
                  disabled={!isPremium}
                  value={cfg.slackWebhook}
                  onChange={(e) => setCfg({ ...cfg, slackWebhook: e.target.value })}
                  style={{ ...inputStyle, width: "100%", opacity: isPremium ? 1 : 0.6 }}
                  placeholder="https://hooks.slack.com/services/…"
                />
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label>Frequency
                  <select
                    disabled={!isPremium}
                    value={cfg.digest.frequency}
                    onChange={(e) => setCfg({ ...cfg, digest: { ...cfg.digest, frequency: e.target.value } })}
                    style={{ ...inputStyle, opacity: isPremium ? 1 : 0.6 }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label>Time (UTC hour)
                  <input
                    type="number"
                    min="0"
                    max="23"
                    disabled={!isPremium}
                    value={cfg.digest.hourUTC}
                    onChange={(e) => setCfg({ ...cfg, digest: { ...cfg.digest, hourUTC: Number(e.target.value) } })}
                    style={{ ...inputStyle, width: 120, opacity: isPremium ? 1 : 0.6 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveCfg} style={btnSecondary} disabled={!isPremium}>Save settings</button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/slack/digest", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ test: true, webhook: cfg.slackWebhook || "" }),
                      });
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      alert("Sent test ping to Slack webhook (if provided).");
                    } catch (e) {
                      alert(`Could not send test: ${String(e.message || e)}`);
                    }
                  }}
                  style={btnGhost}
                  disabled={!isPremium}
                  title={isPremium ? "Send a Slack test message" : "Premium required"}
                >
                  Send test to Slack
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
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
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={cardStyle} id="source-medium" aria-labelledby="sec-source-medium">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-source-medium" style={{ margin: 0 }}>Source / Medium</h3>
        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
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
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Source</th>
                <th style={thLeft}>Medium</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.medium}-${i}`}>
                  <td style={tdLeft}>{r.source}</td>
                  <td style={tdLeft}>{r.medium}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>
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
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={cardStyle} id="campaigns" aria-labelledby="sec-campaigns">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-campaigns" style={{ margin: 0 }}>Campaigns</h3>
        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
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
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Campaign</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.campaign}-${i}`}>
                  <td style={tdLeft}>{r.campaign}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>
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
    <section style={cardStyle} aria-labelledby="sec-campaign-drill">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-campaign-drill" style={{ margin: 0 }}>Campaign drill-down</h3>

        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="Type exact campaign name…"
          style={{ ...inputStyle, minWidth: 260 }}
        />
        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId || !campaign}>
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

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12 }}>
          <b>Totals for \u201C{campaign}\u201D:</b>{" "}
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
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Source</th>
                <th style={thLeft}>Medium</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
                <th style={thRight}>Transactions</th>
                <th style={thRight}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {srcMed.map((r) => (
                <tr key={r.key}>
                  <td style={tdLeft}>{r.d1 || "(not set)"}</td>
                  <td style={tdLeft}>{r.d2 || "(not set)"}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                  <td style={tdRight}>{r.transactions.toLocaleString()}</td>
                  <td style={tdRight}>
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
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Ad Content</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
                <th style={thRight}>Transactions</th>
                <th style={thRight}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {content.map((r) => (
                <tr key={r.key}>
                  <td style={tdLeft}>{r.content}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                  <td style={tdRight}>{r.transactions.toLocaleString()}</td>
                  <td style={tdRight}>
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
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Term</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
                <th style={thRight}>Transactions</th>
                <th style={thRight}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {term.map((r) => (
                <tr key={r.key}>
                  <td style={tdLeft}>{r.term}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                  <td style={tdRight}>{r.transactions.toLocaleString()}</td>
                  <td style={tdRight}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && !loading && !totals && (
        <p style={{ marginTop: 8, color: COLOR.textMuted }}>Enter a campaign name and click \u201CLoad Campaign Details\u201D.</p>
      )}
    </section>
  );
}

/* ============================== Campaigns Overview (renamed to KPI metrics) ============================== */
function CampaignsOverview({ propertyId, startDate, endDate, filters, titleOverride }) {
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
    <section style={cardStyle} aria-labelledby="sec-campaigns-overview">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-campaigns-overview" style={{ margin: 0 }}>{titleOverride || "Campaigns (overview)"}</h3>

        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaign name…" style={{ ...inputStyle, minWidth: 220 }} />

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
          style={btnGhost}
          disabled={!visible.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {visible.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Campaign</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
                <th style={thRight}>Transactions</th>
                <th style={thRight}>Revenue</th>
                <th style={thRight}>CVR</th>
                <th style={thRight}>AOV</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key}>
                  <td style={tdLeft}>{r.name}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                  <td style={tdRight}>{r.transactions.toLocaleString()}</td>
                  <td style={tdRight}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                  <td style={tdRight}>{r.cvr.toFixed(2)}%</td>
                  <td style={tdRight}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.aov || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>)}
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
    <section style={cardStyle} id="top-pages" aria-labelledby="sec-top-pages">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-top-pages" style={{ margin: 0 }}>Top pages (views)</h3>
        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
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
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Page Title</th>
                <th style={thLeft}>Path</th>
                <th style={thRight}>Views</th>
                <th style={thRight}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.path}-${i}`}>
                  <td style={tdLeft}>{r.title}</td>
                  <td style={{ ...tdLeft, fontFamily: "monospace" }}>{r.path}</td>
                  <td style={tdRight}>{r.views.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>)}
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
    <section style={cardStyle} aria-labelledby="sec-landing">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-landing" style={{ margin: 0 }}>Landing Pages × Attribution</h3>

        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
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

        <button onClick={exportCsv} style={btnGhost} disabled={!filtered.length}>
          Download CSV
        </button>
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} />
          Top entries only (25)
        </label>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 260 }}>
          <span style={{ fontSize: 13, color: COLOR.text }}>Min sessions</span>
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
          <span style={{ fontSize: 12, color: COLOR.textMuted }}>
            Showing <b>{shownCount.toLocaleString()}</b> of {totalCount.toLocaleString()}
          </span>
        )}
      </div>

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {filtered.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Landing Page</th>
                <th style={thLeft}>Source</th>
                <th style={thLeft}>Medium</th>
                <th style={thRight}>Sessions</th>
                <th style={thRight}>Users</th>
                <th style={thRight}>Transactions</th>
                <th style={thRight}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._k}>
                  <td style={{ ...tdLeft, fontFamily: "monospace" }}>{r.landing}</td>
                  <td style={tdLeft}>{r.source}</td>
                  <td style={tdLeft}>{r.medium}</td>
                  <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                  <td style={tdRight}>{r.users.toLocaleString()}</td>
                  <td style={tdRight}>{r.transactions.toLocaleString()}</td>
                  <td style={tdRight}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>{rows.length ? "No rows match your view filters." : "No rows loaded yet."}</p>)}
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

  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={cardStyle} id="ecom-kpis" aria-labelledby="sec-ecom-kpis">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-ecom-kpis" style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
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

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && totals && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 560 }}>
            <thead>
              <tr>
                <th style={thLeft}>Metric</th>
                <th style={thRight}>Value</th>
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
      {!error && !totals && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No data loaded yet.</p>}
    </section>
  );
}
function Tr({ label, value }) {
  const formatted = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value;
  return (
    <tr>
      <td style={tdLeft}>{label}</td>
      <td style={tdRight}>{formatted}</td>
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
    <section style={cardStyle} id="checkout-funnel" aria-labelledby="sec-checkout">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-checkout" style={{ margin: 0 }}>Checkout funnel (event counts)</h3>
        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId}>
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

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {steps ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 520 }}>
            <thead>
              <tr>
                <th style={thLeft}>Step</th>
                <th style={thRight}>Count</th>
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
                  <td style={tdLeft}>{label}</td>
                  <td style={tdRight}>{(val || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (!error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>)}
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
    <section style={cardStyle} id="trends" aria-labelledby="sec-trends">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-trends" style={{ margin: 0 }}>Trends over time</h3>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Granularity
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)} style={{ padding: 6, borderRadius: 8, border: `1px solid ${COLOR.cardBorder}` }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <button onClick={load} style={btnSecondary} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
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
          style={btnGhost}
          disabled={!hasRows}
        >
          Download CSV
        </button>
      </div>

      {error && <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows, granularity)}
              alt="Sessions & Users trend"
              style={{ maxWidth: "100%", height: "auto", border: `1px solid ${COLOR.cardBorder}`, borderRadius: 8 }}
            />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thLeft}>Period</th>
                  <th style={thRight}>Sessions</th>
                  <th style={thRight}>Users</th>
                  <th style={thRight}>Transactions</th>
                  <th style={thRight}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = (granularity === "weekly" ? formatYearWeekRange(r.period) : formatYYYYMMDD(r.period));
                  return (
                    <tr key={r.period} title={r.period}>
                      <td style={tdLeft}>{label}</td>
                      <td style={tdRight}>{r.sessions.toLocaleString()}</td>
                      <td style={tdRight}>{r.users.toLocaleString()}</td>
                      <td style={tdRight}>{r.transactions.toLocaleString()}</td>
                      <td style={tdRight}>
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (!error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>)}
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
    <section style={cardStyle} aria-labelledby="sec-products">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="sec-products" style={{ margin: 0 }}>Product Performance</h3>
        <button
          onClick={load}
          style={btnSecondary}
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
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>

        <span style={{ color: COLOR.textMuted, fontSize: 12 }}>
          Respects global filters (Country / Channel Group).
        </span>
      </div>

      {error && (
        <p style={{ color: COLOR.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thLeft}>Item</th>
                <th style={thLeft}>Item ID</th>
                <th style={thRight}>Items viewed</th>
                <th style={thRight}>Items added to cart</th>
                <th style={thRight}>Items purchased</th>
                <th style={thRight}>Item revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td style={tdLeft}>{r.name}</td>
                  <td style={{ ...tdLeft, fontFamily: "monospace" }}>{r.id || "—"}</td>
                  <td style={tdRight}>{r.views.toLocaleString()}</td>
                  <td style={tdRight}>{r.carts.toLocaleString()}</td>
                  <td style={tdRight}>{r.purchases.toLocaleString()}</td>
                  <td style={tdRight}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLOR.textMuted }}>No rows loaded yet.</p>
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
  premiumRequired,
  isPremium,
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
    <section style={cardStyle} aria-labelledby="sec-views">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 id="sec-views" style={{ margin: 0, fontSize: 16 }}>Saved Views</h3>
        {premiumRequired && !isPremium && (
          <span style={{ padding: "4px 8px", background: "rgba(66,133,244,0.10)", color: COLOR.googleBlue, borderRadius: 999, fontSize: 12 }}>
            Premium required
          </span>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view (e.g. UK · Organic · Sep)"
          style={{ ...inputStyle, minWidth: 260 }}
          disabled={premiumRequired && !isPremium}
        />
        <button onClick={saveCurrent} style={btnSecondary} disabled={premiumRequired && !isPremium}>
          Save current
        </button>
        {notice && <span style={{ color: COLOR.googleGreen, fontSize: 12 }}>{notice}</span>}
      </div>

      {presets.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {presets.map((p) => (
            <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 280 }}>
                <b>{p.name}</b>{" "}
                <span style={{ color: COLOR.textMuted, fontSize: 12 }}>
                  {p.startDate} \u2192 {p.endDate} · {p.country} · {p.channelGroup} {p.comparePrev ? "· compare" : ""}
                </span>
              </div>
              <button onClick={() => apply(p, false)} style={btnGhost}>
                Apply
              </button>
              <button onClick={() => apply(p, true)} style={btnGhost}>
                Apply & Run
              </button>
              <button onClick={() => remove(p)} style={{ ...btnGhost, color: COLOR.googleRed }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ marginTop: 8, color: COLOR.textMuted, fontSize: 13 }}>
          No saved views yet. Set dates/filters, give it a name, then \u201CSave current\u201D.
        </p>
      )}
    </section>
  );
}

/* ============================== CHANGE LOG / NOTES ============================== */
// (Rendered below the code block as per output contract)
