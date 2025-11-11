/* eslint-disable @next/next/no-img-element */
// pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

/**
 * ============================================================================
 * InsightGPT / AnalyticsAssistant — Dashboard
 * This version keeps your full UI but fixes:
 *  - GA status detection (now uses hasTokens/expired)
 *  - Property bootstrap (auto-populates from /api/ga4/properties after auth)
 *  - GA querying (uses /api/ga4/query-raw like the smoketest; falls back to legacy)
 * ============================================================================
 */

/* ============================== Constants ============================== */
const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";
const KPI_TARGETS_KEY = "insightgpt_kpi_targets_v1";
const ALERTS_CFG_KEY = "insightgpt_alerts_cfg_v1";
const PREMIUM_FLAG_KEY = "insightgpt_premium_flag_v1"; // "Alpha" or "Pro"
const LS_GA_CONNECTED = "insightgpt_ga_session_connected";
const LS_LAST_PROPERTY = "insightgpt_last_property_id";

const COLORS = {
  googleBlue: "#4285F4",
  googleGreen: "#34A853",
  googleRed: "#EA4335",
  frost: "#F7F9FB",
  frostEdge: "#E9EEF5",
  text: "#111827",
  subtext: "#6B7280",
  border: "#E5E7EB",
  soft: "#F3F4F6",
};

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

/* ============================== Utilities ============================== */
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
async function fetchJson(url, payload, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || (payload ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.method === "GET" || !payload ? undefined : JSON.stringify(payload || {}),
    cache: opts.cache || "no-store",
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
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data || {};
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

/** Map your UI filters to GA4 dimensionFilter used by /api/ga4/query-raw */
function buildDimensionFilter({ country = "All", channelGroup = "All" }) {
  const expressions = [];
  if (country && country !== "All") {
    expressions.push({
      filter: {
        fieldName: "country",
        stringFilter: { matchType: "EXACT", value: country, caseSensitive: false },
      },
    });
  }
  if (channelGroup && channelGroup !== "All") {
    expressions.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: channelGroup, caseSensitive: false },
      },
    });
  }
  if (!expressions.length) return undefined;
  return { andGroup: { expressions } };
}

/** Channels table parser (kept from your code) */
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

/** CSV + chart helpers (unchanged) */
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
function loadKpiTargets() {
  try {
    const raw =
      localStorage.getItem(KPI_TARGETS_KEY) || localStorage.getItem("kpi_targets_v1");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function pctToTarget(current, target) {
  if (!target || target <= 0) return null;
  return Math.round((current / target) * 100);
}

/* ============================== Reusable UI ============================== */
function Pill({ color = "#999", bg = "#eee", text, title }) {
  return (
    <span
      title={title || ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${bg}`,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 0 2px ${bg}`,
        }}
      />
      {text}
    </span>
  );
}
function FrostCard({ title, actions, children, id }) {
  return (
    <section
      id={id}
      style={{
        marginTop: 18,
        border: `1px solid ${COLORS.frostEdge}`,
        borderRadius: 14,
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 8px 24px rgba(16,24,40,0.06)",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: `1px solid ${COLORS.frostEdge}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, color: COLORS.text }}>{title}</h3>
        {actions ? <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}
function Button({ onClick, children, disabled, kind = "default", title, id, style }) {
  const base = {
    padding: "11px 16px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: "#fff",
    color: COLORS.text,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontWeight: 700,
    letterSpacing: "0.01em",
    boxShadow: "0 1px 0 rgba(16,24,40,0.05)",
  };
  const kinds = {
    default: base,
    primary: {
      ...base,
      background: COLORS.googleBlue,
      borderColor: "#2C6AD9",
      color: "#fff",
    },
    primaryCta: {
      ...base,
      background: COLORS.googleBlue,
      borderColor: "#1b5bd6",
      color: "#fff",
      boxShadow: "0 6px 20px rgba(66,133,244,0.35)",
      transform: "translateZ(0)",
    },
    subtle: {
      ...base,
      background: COLORS.soft,
      borderColor: COLORS.border,
      color: COLORS.text,
    },
    danger: {
      ...base,
      background: "#fff5f5",
      borderColor: "#ffd6d6",
      color: COLORS.googleRed,
    },
  };
  const st = { ...kinds[kind] };
  return (
    <button id={id} title={title} onClick={onClick} disabled={disabled} style={{ ...st, ...(style || {}) }}>
      {children}
    </button>
  );
}
function BlueAiButton(props) {
  return <Button kind="primary" {...props} />;
}
function Skeleton({ height = 16, width = "100%", radius = 6 }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, #f2f4f7 25%, #eaeef3 37%, #f2f4f7 63%)",
        backgroundSize: "400% 100%",
        animation: "sweep 1.4s ease infinite",
      }}
    />
  );
}

/* Keyframe for Skeleton + mobile accordion styles (once) */
if (typeof document !== "undefined" && !document.getElementById("sweep-keyframes")) {
  const style = document.createElement("style");
  style.id = "sweep-keyframes";
  style.textContent = `
  @keyframes sweep {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (max-width: 768px) {
    .mobile-accordion details > summary { 
      list-style: none;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 10px;
      background: #F3F4F6;
      border: 1px solid #E5E7EB;
      font-weight: 600;
    }
    .mobile-accordion details[open] > summary {
      background: #EEF2FF;
      border-color: #E0E7FF;
    }
    .mobile-accordion .accordion-inner {
      padding: 10px 0 2px;
    }
  }`;
  document.head.appendChild(style);
}

/* ============================== Premium Gate ============================== */
function isPremium() {
  try {
    const raw = localStorage.getItem(PREMIUM_FLAG_KEY);
    if (!raw) return false;
    const v = String(raw || "").toLowerCase();
    return v === "alpha" || v === "pro" || v === "true" || v === "yes";
  } catch {
    return false;
  }
}

/* ============================== KPI Target Badge ============================== */
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
        marginLeft: 6,
        padding: "2px 8px",
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

/* ============================== Sticky Top Bar (status) ============================== */
function StatusDot({ status, label }) {
  const map = {
    good: { bg: "#e6f4ea", bc: "#b7e1cd", dot: COLORS.googleGreen, text: "#14532D" },
    bad: { bg: "#fdecea", bc: "#f4c7c3", dot: COLORS.googleRed, text: "#7F1D1D" },
    unknown: { bg: "#f8fafc", bc: "#e2e8f0", dot: "#94A3B8", text: "#334155" },
  };
  const s = map[status] || map.unknown;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${s.bc}`,
        background: s.bg,
        color: s.text,
        fontSize: 12,
        fontWeight: 600,
      }}
      title={label}
    >
      <span style={{ width: 8, height: 8, borderRadius: 8, background: s.dot }} aria-hidden />
      {label}
    </span>
  );
}

/* ============================== Page ============================== */
export default function Home() {
  // Base controls
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  // Filters
  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");
  const [appliedFilters, setAppliedFilters] = useState({ country: "All", channelGroup: "All" });

  // Global signals
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [dashKey, setDashKey] = useState(1);

  // Channel results (hero)
  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  const { rows, totals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(() => parseGa4Channels(prevResult), [prevResult]);

  // Status & errors
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Connection status & properties
  const [gaSessionConnected, setGaSessionConnected] = useState(false);
  const [gaStatusLoading, setGaStatusLoading] = useState(true);
  const [hasProperty, setHasProperty] = useState(false);

  const [propsState, setPropsState] = useState({ loading: true, email: null, properties: [], error: null });

  // Saved views notice
  const [saveNotice, setSaveNotice] = useState("");

  // Refs
  const topAnchorRef = useRef(null);

  /* ------------------------ Init from URL + preset ------------------------ */
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
      const lastProp = localStorage.getItem(LS_LAST_PROPERTY) || "";
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      else if (lastProp) setPropertyId(lastProp);
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
      if (propertyId) localStorage.setItem(LS_LAST_PROPERTY, String(propertyId));
    } catch {}
  }, [propertyId, startDate, endDate, appliedFilters, countrySel, channelSel]);

  useEffect(() => {
    setHasProperty(!!(propertyId && String(propertyId).trim()));
  }, [propertyId]);

  /* ------------------------ New: Robust GA session status ------------------------ */
  useEffect(() => {
    let mounted = true;
    let pollId = null;
    let attempts = 0;

    const markConnected = (val) => {
      if (!mounted) return;
      setGaSessionConnected(!!val);
      setGaStatusLoading(false);
      try {
        localStorage.setItem(LS_GA_CONNECTED, val ? "1" : "0");
      } catch {}
    };

    const checkAuth = async () => {
      try {
        setGaStatusLoading(true);
        const data = await fetchJson("/api/auth/google/status", null, { method: "GET" });
        const isConnected = !!(data?.hasTokens && data?.expired === false);
        markConnected(isConnected);
      } catch {
        // Fallback to last-known state
        try {
          const last = localStorage.getItem(LS_GA_CONNECTED);
          markConnected(last === "1");
        } catch {
          markConnected(false);
        }
      }
    };

    checkAuth();

    // Poll briefly after page load to catch OAuth callback
    pollId = setInterval(async () => {
      attempts += 1;
      if (attempts > 6) {
        clearInterval(pollId);
        pollId = null;
        return;
      }
      await checkAuth();
    }, 10000);

    // Refresh on tab focus or when user returns
    const onFocus = () => checkAuth();
    const onVis = () => {
      if (document.visibilityState === "visible") checkAuth();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mounted = false;
      if (pollId) clearInterval(pollId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /* ------------------------ New: Load GA4 properties after auth ------------------------ */
  useEffect(() => {
    const loadProps = async () => {
      if (!gaSessionConnected) {
        setPropsState({ loading: false, email: null, properties: [], error: null });
        return;
      }
      try {
        setPropsState((s) => ({ ...s, loading: true, error: null }));
        const j = await fetchJson("/api/ga4/properties", null, { method: "GET" });
        if (!j.ok) throw new Error(j.error || "Failed to list properties");
        const props = j.properties || [];
        // If no property is set, pick last used or first available
        if (!propertyId && props.length > 0) {
          const last = (typeof window !== "undefined" && localStorage.getItem(LS_LAST_PROPERTY)) || "";
          const chosen = last && props.some((p) => String(p.id) === String(last)) ? last : String(props[0].id);
          setPropertyId(chosen);
          try { localStorage.setItem(LS_LAST_PROPERTY, String(chosen)); } catch {}
        }
        setPropsState({ loading: false, email: j.email || null, properties: props, error: null });
      } catch (e) {
        setPropsState({ loading: false, email: null, properties: [], error: e.message || String(e) });
      }
    };
    loadProps();
    // only when session flips to connected or propertyId changes from empty to set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaSessionConnected]);

  /* ------------------------ Actions ------------------------ */
  const connect = () => {
    window.location.href = "/api/auth/google/start?redirect=/";
  };
  const applyFilters = () => {
    setAppliedFilters({ country: countrySel, channelGroup: channelSel });
  };

  /** Primary GA call for Channels hero — tries query-raw first, falls back to legacy */
  async function fetchGa4Channels({ propertyId, startDate, endDate, filters }) {
    const dateRanges = [{ startDate, endDate }];
    const dimensionFilter = buildDimensionFilter(filters || {});
    const body = {
      propertyId: String(propertyId),
      dateRanges,
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      dimensionFilter,
      limit: 100,
    };

    // Attempt query-raw (smoketest-proven)
    try {
      const r = await fetchJson("/api/ga4/query-raw", body);
      if (r?.ok && r?.response?.rows) return r.response;
      // Some older handlers wrap directly
      if (r?.rows) return r;
      throw new Error(r?.error || "query-raw returned no rows");
    } catch (e) {
      // Fallback to your legacy "/api/ga4/query" if present
      try {
        const legacy = await fetchJson("/api/ga4/query", { propertyId, startDate, endDate, filters });
        return legacy;
      } catch (e2) {
        // Surface the original error for clarity
        throw e;
      }
    }
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
      // If the call works, we are definitely connected
      setGaSessionConnected(true);
      try {
        localStorage.setItem(LS_GA_CONNECTED, "1");
      } catch {}

      setResult(curr);

      // Update URL to reflect the view we just ran
      try {
        const qs = encodeQuery({ startDate, endDate, appliedFilters, comparePrev });
        const path = window.location.pathname + (qs ? `?${qs}` : "");
        window.history.replaceState(null, "", path);
      } catch {}

      // Broadcast reset for sections & AI
      setRefreshSignal((n) => n + 1);

      // Scroll user to the hero block after run
      setTimeout(() => {
        if (topAnchorRef.current) {
          topAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 80);

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
      if (e.status === 401 || e.status === 403 || /expired|unauthor/i.test(String(e.message || ""))) {
        setGaSessionConnected(false);
        try {
          localStorage.setItem(LS_GA_CONNECTED, "0");
        } catch {}
        setError(
          'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then run again.'
        );
      } else {
        setError(String(e.message || e));
      }
    } finally {
      setLoading(false);
    }
  };

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
    setDashKey((k) => k + 1);
    try {
      const path = window.location.pathname;
      window.history.replaceState(null, "", path);
    } catch {}
  };

  const top = rows[0];
  const topShare =
    top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

  /* ============================== Sticky header ============================== */
  const sessionStatus = gaStatusLoading
    ? { s: "unknown", label: "Google session: Checking…" }
    : gaSessionConnected
    ? { s: "good", label: "Google session: Connected" }
    : { s: "bad", label: "Google session: Not connected" };

  const propertyStatus = hasProperty
    ? { s: "good", label: "Property ID: Present" }
    : { s: "bad", label: "Property ID: Missing" };

  /* ============================== Premium ============================== */
  const premium = isPremium();

  const runDisabled = loading || !hasProperty; // session flag no longer blocks run

  /* ============================== UI ============================== */
  return (
    <main
      style={{
        padding: 16,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        maxWidth: 1150,
        margin: "0 auto",
        color: COLORS.text,
      }}
    >
      {/* Sticky nav */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${COLORS.frostEdge}`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "10px 2px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Image
              src="/logo.svg"
              alt="InsightGPT"
              width={26}
              height={26}
              priority
            />
            <h1 style={{ margin: 0, fontSize: 18 }}>InsightGPT (MVP)</h1>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <StatusDot status={sessionStatus.s} label={sessionStatus.label} />
            <StatusDot status={propertyStatus.s} label={propertyStatus.label} />
            <Button
              onClick={connect}
              title="Connect Google Analytics"
              kind="primaryCta"
              id="cta-connect-google"
            >
              Connect Google Analytics
            </Button>
          </div>
        </div>
      </div>

      {/* Subheading */}
      <p style={{ marginTop: 12, color: COLORS.subtext }}>
        Connect GA4, enter a Property ID, choose a date range, optionally apply filters, and run your report.
      </p>

      {/* Controls */}
      <FrostCard
        title="Controls"
        actions={
          <>
            <Button
              onClick={runReport}
              disabled={runDisabled}
              title={!hasProperty ? "Enter a GA4 Property ID" : "Run"}
              kind="primaryCta"
              id="cta-run-report"
            >
              {loading ? "Running…" : "Run GA4 Report"}
            </Button>
            <Button
              onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
              disabled={!rows.length}
              title={rows.length ? "Download channels table as CSV" : "Run a report first"}
            >
              Download CSV
            </Button>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                id="compare-prev"
                type="checkbox"
                checked={comparePrev}
                onChange={(e) => setComparePrev(e.target.checked)}
              />
              Compare vs previous period
            </label>
            <Button onClick={resetDashboard} title="Reset all filters & date range">
              Reset
            </Button>
          </>
        }
      >
        {/* Property selector (auto-loaded) + manual entry stay side-by-side */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <label htmlFor="property-select" style={{ fontSize: 12, color: COLORS.subtext }}>
              GA4 Property (from Google)
            </label>
            <select
              id="property-select"
              value={String(propertyId || "")}
              onChange={(e) => setPropertyId(e.target.value)}
              style={{
                marginTop: 6,
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <option value="">{propsState.loading ? "Loading…" : "(none selected)"}</option>
              {(propsState.properties || []).map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.displayName} (id: {p.id})
                </option>
              ))}
            </select>
            {propsState.error ? (
              <div style={{ color: COLORS.googleRed, marginTop: 6, fontSize: 12 }}>Props error: {propsState.error}</div>
            ) : null}
          </div>

          <div>
            <label htmlFor="property-id" style={{ fontSize: 12, color: COLORS.subtext }}>
              Or enter GA4 Property ID manually
            </label>
            <input
              id="property-id"
              name="property-id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="e.g. 123456789"
              style={{
                marginTop: 6,
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            />
          </div>

          <div>
            <label htmlFor="start-date" style={{ fontSize: 12, color: COLORS.subtext }}>
              Start date
            </label>
            <input
              id="start-date"
              name="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                marginTop: 6,
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            />
          </div>

          <div>
            <label htmlFor="end-date" style={{ fontSize: 12, color: COLORS.subtext }}>
              End date
            </label>
            <input
              id="end-date"
              name="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                marginTop: 6,
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            />
          </div>

          <div>
            <label htmlFor="country-filter" style={{ fontSize: 12, color: COLORS.subtext }}>
              Country
            </label>
            <select
              id="country-filter"
              value={countrySel}
              onChange={(e) => setCountrySel(e.target.value)}
              style={{
                marginTop: 6,
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="channel-filter" style={{ fontSize: 12, color: COLORS.subtext }}>
              Channel Group
            </label>
            <select
              id="channel-filter"
              value={channelSel}
              onChange={(e) => setChannelSel(e.target.value)}
              style={{
                marginTop: 6,
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {CHANNEL_GROUP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button onClick={applyFilters} title="Apply filters">Apply filters</Button>
            {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
              <Pill
                color={COLORS.googleGreen}
                bg="#E6F4EA"
                text={`Filters: ${appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}${appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}${appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}`}
                title="Active filters"
              />
            )}
          </div>
        </div>
      </FrostCard>

      {/* Saved Views (Premium) */}
      <div style={{ marginTop: 12 }}>
        <SavedViews
          premium={premium}
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
          onNotice={(m) => {
            setSaveNotice(m || "");
            if (m) setTimeout(() => setSaveNotice(""), 1200);
          }}
        />
        {saveNotice && (
          <div style={{ marginTop: 6 }}>
            <Pill color={COLORS.googleGreen} bg="#E6F4EA" text={saveNotice} />
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            color: COLORS.googleRed,
            background: "#fff5f5",
            border: "1px solid #ffd6d6",
            padding: 12,
            borderRadius: 10,
            marginTop: 16,
          }}
        >
          <b>Error:</b> <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
        </div>
      )}

      {/* Anchor to scroll after running */}
      <div ref={topAnchorRef} />

      {/* HERO: Traffic by Default Channel Group (always under controls) */}
      {loading && (
        <FrostCard title="Traffic by Default Channel Group">
          <div style={{ display: "grid", gap: 10 }}>
            <Skeleton height={16} width="40%" />
            <Skeleton height={200} />
            <Skeleton height={16} width="60%" />
          </div>
        </FrostCard>
      )}
      {!loading && rows.length > 0 && (
        <FrostCard
          id="hero-channels"
          title={
            <>
              Traffic by Default Channel Group{" "}
              <TargetBadge
                label="Sessions"
                current={Number(totals?.sessions || 0)}
                target={Number(loadKpiTargets()?.sessionsTarget)}
              />
            </>
          }
          actions={
            <>
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
                resetSignal={refreshSignal}
                blueCta
              />
              <Button
                onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
                disabled={!rows.length}
                title="Download channels CSV"
              >
                Download CSV
              </Button>
            </>
          }
        >
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
                  <b>Sessions vs previous:</b> {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev{" "}
                  {prevTotals.sessions.toLocaleString()})
                </li>
                <li>
                  <b>Users vs previous:</b> {formatPctDelta(totals.users, prevTotals.users)} (prev{" "}
                  {prevTotals.users.toLocaleString()})
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

          <div style={{ marginTop: 16 }}>
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>
        </FrostCard>
      )}

      {/* MOBILE-ONLY ACCORDION FOR KEY KPIs */}
      <div className="mobile-accordion" style={{ marginTop: 12 }}>
        <MobileAccordionSection title="Top pages (views)">
          <TopPages
            key={`tp-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
        </MobileAccordionSection>

        <MobileAccordionSection title="Source / Medium">
          <SourceMedium
            key={`sm-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
        </MobileAccordionSection>

        <MobileAccordionSection title="E-commerce KPIs">
          <EcommerceKPIs
            key={`ekpi-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
        </MobileAccordionSection>

        <MobileAccordionSection title="Checkout funnel (event counts)">
          <CheckoutFunnel
            key={`cf-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
        </MobileAccordionSection>
      </div>

      {/* DESKTOP/VISIBLE SECTIONS (non-accordion) */}
      <div style={{ display: "grid", gap: 8 }}>
        <HideOnMobile>
          <TopPages
            key={`tp2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
          <SourceMedium
            key={`sm2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
          <EcommerceKPIs
            key={`ekpi2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
          <CheckoutFunnel
            key={`cf2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
        </HideOnMobile>
      </div>

      {/* PREMIUM SECTIONS */}
      <PremiumGate label="Trends over time" premium={premium}>
        <TrendsOverTime
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      <PremiumGate label="Campaigns" premium={premium}>
        <Campaigns
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      <PremiumGate label="Campaign drill-down" premium={premium}>
        <CampaignDrilldown
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      <PremiumGate label="Campaigns (KPI metrics)" premium={premium}>
        <CampaignsOverview
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
        />
      </PremiumGate>

      {process.env.NEXT_PUBLIC_ENABLE_PRODUCTS === "true" && (
        <Products
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          resetSignal={refreshSignal}
        />
      )}

      {/* KPI Targets & Alerts / Digest (Premium) */}
      <PremiumGate label="KPI Targets & Alerts / Digest" premium={premium}>
        <KpiAndAlerts />
      </PremiumGate>

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

/* ============================== Helpers: Responsive wrappers ============================== */
function HideOnMobile({ children }) {
  return (
    <div
      style={{
        display: "block",
      }}
    >
      <style jsx>{`
        @media (max-width: 768px) {
          div {
            display: none;
          }
        }
      `}</style>
      {children}
    </div>
  );
}
function MobileOnly({ children }) {
  return (
    <div style={{ display: "none" }}>
      <style jsx>{`
        @media (max-width: 768px) {
          div {
            display: block;
          }
        }
      `}</style>
      {children}
    </div>
  );
}
function MobileAccordionSection({ title, children }) {
  return (
    <MobileOnly>
      <details style={{ marginTop: 12 }}>
        <summary>{title}</summary>
        <div className="accordion-inner">{children}</div>
      </details>
    </MobileOnly>
  );
}

/* ============================== Reusable AI block ============================== */
function AiBlock({ asButton = false, buttonLabel = "Summarise with AI", endpoint, payload, resetSignal, blueCta = false }) {
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

  const runBtn = blueCta ? (
    <BlueAiButton onClick={run} disabled={loading} title="AI summary">
      {loading ? "Summarising…" : buttonLabel}
    </BlueAiButton>
  ) : (
    <Button onClick={run} disabled={loading} title="AI summary">
      {loading ? "Summarising…" : buttonLabel}
    </Button>
  );

  return (
    <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {asButton ? runBtn : (
        <BlueAiButton onClick={run} disabled={loading} title="AI summary">
          {loading ? "Summarising…" : "Summarise with AI"}
        </BlueAiButton>
      )}
      <Button onClick={copy} disabled={!text}>
        {copied ? "Copied!" : "Copy insight"}
      </Button>
      {error && <span style={{ color: COLORS.googleRed }}>Error: {error}</span>}
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

/* ============================== Sections ============================== */
/**
 * The following sections keep your original logic but benefit automatically
 * from the fixed status + property bootstrapping. They still call their
 * dedicated API routes; the global hero switched to query-raw for reliability.
 */

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

  const totalSessions = useMemo(
    () => rows.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [rows]
  );
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <FrostCard
      title="Source / Medium"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load"}
          </Button>
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
            blueCta
          />
          <Button
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
            disabled={!rows.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>}
      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={16} width="50%" />
          <Skeleton height={120} />
        </div>
      )}
      {!loading && rows.length > 0 && (
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
      )}
    </FrostCard>
  );
}

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
      const parsed = (data.rows || []).map((r) => ({
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
    <FrostCard
      title="Campaigns"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load"}
          </Button>
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
            blueCta
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
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>}
      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={16} width="50%" />
          <Skeleton height={120} />
        </div>
      )}
      {!loading && rows.length > 0 && (
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
      )}
    </FrostCard>
  );
}

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
    <FrostCard
      title="Campaign drill-down"
      actions={
        <>
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="Type exact campaign name…"
            style={{
              padding: 8,
              minWidth: 260,
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
            }}
          />
          <Button onClick={load} disabled={loading || !propertyId || !campaign}>
            {loading ? "Loading…" : "Load"}
          </Button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{
              topic: "campaign-detail",
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
            blueCta
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals && (
        <div style={{ marginTop: 12 }}>
          <b>Totals for &ldquo;{campaign}&rdquo;:</b>{" "}
          Sessions {totals.sessions.toLocaleString()} · Users {totals.users.toLocaleString()} ·
          Transactions {totals.transactions.toLocaleString()} · Revenue{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} · CVR{" "}
          {(cvr || 0).toFixed(2)}% · AOV{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov || 0)}
        </div>
      )}

      {!loading && !totals && !error && (
        <p style={{ marginTop: 8, color: COLORS.subtext }}>
          Enter a campaign name and click &ldquo;Load&rdquo;.
        </p>
      )}

      {loading && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={120} />
          <Skeleton height={18} width="50%" />
          <Skeleton height={120} />
        </div>
      )}

      {srcMed.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Source / Medium</h4>
          <TableSix cols={["Source", "Medium", "Sessions", "Users", "Transactions", "Revenue"]}>
            {srcMed.map((r) => (
              <tr key={r.key}>
                <TdLeft>{r.d1 || "(not set)"}</TdLeft>
                <TdLeft>{r.d2 || "(not set)"}</TdLeft>
                <TdRight>{r.sessions.toLocaleString()}</TdRight>
                <TdRight>{r.users.toLocaleString()}</TdRight>
                <TdRight>{r.transactions.toLocaleString()}</TdRight>
                <TdRight>
                  {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                </TdRight>
              </tr>
            ))}
          </TableSix>
        </div>
      )}

      {content.length > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Ad Content (utm_content)</h4>
          <TableFive cols={["Ad Content", "Sessions", "Users", "Transactions", "Revenue"]}>
            {content.map((r) => (
              <tr key={r.key}>
                <TdLeft>{r.content}</TdLeft>
                <TdRight>{r.sessions.toLocaleString()}</TdRight>
                <TdRight>{r.users.toLocaleString()}</TdRight>
                <TdRight>{r.transactions.toLocaleString()}</TdRight>
                <TdRight>
                  {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                </TdRight>
              </tr>
            ))}
          </TableFive>
        </div>
      )}

      {term.length > 0 && (
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Term (utm_term)</h4>
          <TableFive cols={["Term", "Sessions", "Users", "Transactions", "Revenue"]}>
            {term.map((r) => (
              <tr key={r.key}>
                <TdLeft>{r.term}</TdLeft>
                <TdRight>{r.sessions.toLocaleString()}</TdRight>
                <TdRight>{r.users.toLocaleString()}</TdRight>
                <TdRight>{r.transactions.toLocaleString()}</TdRight>
                <TdRight>
                  {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                </TdRight>
              </tr>
            ))}
          </TableFive>
        </div>
      )}
    </FrostCard>
  );
}

function CampaignsOverview({ propertyId, startDate, endDate, filters }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

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

  const totalSessions = useMemo(
    () => visible.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [visible]
  );
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <FrostCard
      title="Campaigns (KPI metrics)"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load"}
          </Button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaign name…"
            style={{
              padding: 8,
              minWidth: 220,
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
            }}
          />
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
            payload={{
              topic: "campaigns-overview",
              campaigns: visible,
              dateRange: { start: startDate, end: endDate },
              filters,
            }}
            blueCta
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
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !visible.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>}
      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={16} width="50%" />
          <Skeleton height={160} />
        </div>
      )}
      {!loading && visible.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Campaign</th>
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
      )}
    </FrostCard>
  );
}

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
    <FrostCard
      title="Top pages (views)"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load"}
          </Button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pages"
            payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
            blueCta
          />
          <Button
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
            disabled={!rows.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>}
      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={150} />
        </div>
      )}
      {!loading && rows.length > 0 && (
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
      )}
    </FrostCard>
  );
}

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

  return (
    <FrostCard
      title="Landing Pages × Attribution"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
            {loading ? "Loading…" : "Load"}
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
            }}
            blueCta
          />
          <Button
            onClick={() =>
              downloadCsvGeneric(
                `landing_pages_${startDate}_to_${endDate}`,
                filtered,
                [
                  { header: "Landing Page", key: "landing" },
                  { header: "Source", key: "source" },
                  { header: "Medium", key: "medium" },
                  { header: "Sessions", key: "sessions" },
                  { header: "Users", key: "users" },
                  { header: "Transactions", key: "transactions" },
                  { header: "Revenue", key: "revenue" },
                ]
              )
            }
            disabled={!filtered.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {!loading && !rows.length && !error && (
        <p style={{ marginTop: 8, color: COLORS.subtext }}>
          No rows loaded yet.
        </p>
      )}

      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={16} width="50%" />
          <Skeleton height={180} />
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
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

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Landing Page</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Source</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Medium</th>
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </FrostCard>
  );
}

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

  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <FrostCard
      title="E-commerce KPIs"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load"}
          </Button>
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
            blueCta
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !totals && !loading && <p style={{ color: COLORS.subtext }}>No data loaded yet.</p>}
      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={150} />
        </div>
      )}
      {!loading && totals && (
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
              <Tr label="Conversion Rate (purchase / session)" value={`${(totals.cvr || 0).toFixed(2)}%`} />
              <Tr
                label="AOV (Revenue / Transactions)"
                value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.aov || 0)}
              />
            </tbody>
          </table>
        </div>
      )}
    </FrostCard>
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
    <FrostCard
      title="Checkout funnel (event counts)"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId}>
            {loading ? "Loading…" : "Load"}
          </Button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-funnel"
            payload={{ steps, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
            blueCta
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {!loading && !steps && !error && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>}

      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={150} />
        </div>
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
      ) : null}
    </FrostCard>
  );
}

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
    <FrostCard
      title="Trends over time"
      actions={
        <>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Granularity
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              style={{ padding: 6, borderRadius: 8, border: `1px solid ${COLORS.border}` }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
            {loading ? "Loading…" : "Load"}
          </Button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{
              topic: "timeseries",
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
            blueCta
          />
          <Button
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
            disabled={!hasRows}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={22} width="30%" />
          <Skeleton height={220} />
        </div>
      )}

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
      ) : !error && !loading ? (
        <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>
      ) : null}
    </FrostCard>
  );
}

/* Reusable table helpers */
function TableSix({ cols, children }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function TableFive({ cols, children }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          {cols.map((c, idx) => (
            <th
              key={c}
              style={{
                textAlign: idx === 0 ? "left" : "right",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function TdLeft({ children }) {
  return <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{children}</td>;
}
function TdRight({ children }) {
  return (
    <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>{children}</td>
  );
}

function Products({ propertyId, startDate, endDate, filters, resetSignal }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);

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
        iItemName >= 0
          ? r.dimensionValues?.[iItemName]?.value || "(unknown)"
          : iItemId >= 0
          ? r.dimensionValues?.[iItemId]?.value || "(unknown)"
          : `(row ${idx + 1})`;

      const views = iViews >= 0 ? Number(r.metricValues?.[iViews]?.value || 0) : 0;
      const carts = iCarts >= 0 ? Number(r.metricValues?.[iCarts]?.value || 0) : 0;
      const purchases =
        iPurchQty >= 0
          ? Number(r.metricValues?.[iPurchQty]?.value || 0)
          : iPurchAlt1 >= 0
          ? Number(r.metricValues?.[iPurchAlt1]?.value || 0)
          : 0;
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

  return (
    <FrostCard
      title="Product Performance"
      actions={
        <>
          <Button onClick={load} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
            {loading ? "Loading…" : "Load"}
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
            }}
            resetSignal={resetSignal}
            blueCta
          />
          <Button
            onClick={() =>
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
              )
            }
            disabled={!rows.length}
          >
            Download CSV
          </Button>
          <span style={{ color: COLORS.subtext, fontSize: 12 }}>Respects global filters (Country / Channel Group).</span>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>}

      {loading && (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="40%" />
          <Skeleton height={200} />
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Item</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Item ID</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items viewed</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items added to cart</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Items purchased</th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>Item revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.name}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}>
                    {r.id || "—"}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.views.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.carts.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.purchases.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {debug && (
        <details style={{ marginTop: 10 }}>
          <summary>Raw products response (debug)</summary>
          <pre
            style={{
              marginTop: 8,
              background: "#f8f8f8",
              padding: 12,
              borderRadius: 6,
              overflow: "auto",
            }}
          >
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      )}
    </FrostCard>
  );
}

/* ============================== Saved Views (Premium) ============================== */
function SavedViews({ premium, startDate, endDate, countrySel, channelSel, comparePrev, onApply, onRunReport, onNotice }) {
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState("");

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
      onNotice?.("Give your view a name.");
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
    onNotice?.("Saved!");
    setTimeout(() => onNotice?.(""), 1200);
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

  const body = (
    <section
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px dashed #e0e0e0",
        borderRadius: 8,
        background: "#fbfbfb",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Saved Views</h3>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view (e.g. UK · Organic · Sep)"
          style={{ padding: 8, minWidth: 260, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
        />
        <Button onClick={saveCurrent}>Save current</Button>
      </div>

      {presets.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {presets.map((p) => (
            <div
              key={p.name}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                border: `1px solid ${COLORS.border}`,
                padding: 8,
                borderRadius: 10,
              }}
            >
              <div style={{ minWidth: 280 }}>
                <b>{p.name}</b>{" "}
                <span style={{ color: "#666", fontSize: 12 }}>
                  {p.startDate} → {p.endDate} · {p.country} · {p.channelGroup} {p.comparePrev ? "· compare" : ""}
                </span>
              </div>
              <Button onClick={() => apply(p, false)}>Apply</Button>
              <Button onClick={() => apply(p, true)}>Apply &amp; Run</Button>
              <Button onClick={() => remove(p)} kind="danger">
                Delete
              </Button>
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

  if (!premium) {
    return (
      <FrostCard
        title="Saved Views (Premium)"
        actions={<Pill color="#6366F1" bg="#EEF2FF" text="Premium required" />}
      >
        <p style={{ color: COLORS.subtext, margin: 0 }}>
          Saved views are available on Premium. Your existing storage key is preserved ({SAVED_VIEWS_KEY}).
        </p>
      </FrostCard>
    );
  }

  return (
    <FrostCard title="Saved Views">{body}</FrostCard>
  );
}

/* ============================== KPI Targets & Alerts / Digest (Premium) ============================== */
function KpiAndAlerts() {
  const [open, setOpen] = useState(false);

  const [targets, setTargets] = useState({ sessionsTarget: "", revenueTarget: "", cvrTarget: "" });
  const [alerts, setAlerts] = useState({
    z: 2,
    lookback: 28,
    slackWebhook: "",
    digestEnabled: false,
    digestFrequency: "daily",
    digestTime: "09:00",
  });

  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(KPI_TARGETS_KEY) || "null");
      if (t) setTargets({
        sessionsTarget: t.sessionsTarget ?? "",
        revenueTarget: t.revenueTarget ?? "",
        cvrTarget: t.cvrTarget ?? "",
      });
    } catch {}
    try {
      const a = JSON.parse(localStorage.getItem(ALERTS_CFG_KEY) || "null");
      if (a) setAlerts((prev) => ({ ...prev, ...a }));
    } catch {}
  }, []);

  const saveTargets = () => {
    try {
      localStorage.setItem(KPI_TARGETS_KEY, JSON.stringify({
        sessionsTarget: Number(targets.sessionsTarget || 0),
        revenueTarget: Number(targets.revenueTarget || 0),
        cvrTarget: Number(targets.cvrTarget || 0),
      }));
      alert("KPI targets saved.");
    } catch {}
  };
  const saveAlerts = () => {
    try {
      localStorage.setItem(ALERTS_CFG_KEY, JSON.stringify(alerts));
      alert("Alerts / Digest settings saved.");
    } catch {}
  };
  const testSlack = async () => {
    try {
      const res = await fetch("/api/slack/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: alerts.slackWebhook,
          propertyId: "test",
          range: "test",
          test: true,
        }),
      });
      const ok = await res.json().catch(() => ({}));
      alert(res.ok ? "Sent test to Slack." : `Slack test failed: ${res.status} ${ok?.error || ""}`);
    } catch (e) {
      alert(`Slack test failed: ${String(e?.message || e)}`);
    }
  };

  return (
    <FrostCard
      title="KPI Targets & Alerts / Digest (Premium)"
      actions={
        <Button onClick={() => setOpen((v) => !v)}>{open ? "Hide settings" : "Show settings"}</Button>
      }
    >
      {!open ? (
        <p style={{ margin: 0, color: COLORS.subtext }}>
          Configure your KPI targets and anomaly alerting/digest Slack delivery. Click &ldquo;Show settings&rdquo;.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <h4 style={{ margin: "4px 0 8px" }}>KPI Targets</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 10,
              }}
            >
              <LabeledInput
                label="Sessions target"
                value={targets.sessionsTarget}
                onChange={(v) => setTargets((t) => ({ ...t, sessionsTarget: v }))}
                type="number"
              />
              <LabeledInput
                label="Revenue target (GBP)"
                value={targets.revenueTarget}
                onChange={(v) => setTargets((t) => ({ ...t, revenueTarget: v }))}
                type="number"
              />
              <LabeledInput
                label="CVR target (%)"
                value={targets.cvrTarget}
                onChange={(v) => setTargets((t) => ({ ...t, cvrTarget: v }))}
                type="number"
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <Button onClick={saveTargets}>Save KPI Targets</Button>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 8 }}>
            <h4 style={{ margin: "4px 0 8px" }}>Anomaly Alerts &amp; Digest (Slack)</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <LabeledInput
                label="Sensitivity (z)"
                value={alerts.z}
                type="number"
                onChange={(v) => setAlerts((a) => ({ ...a, z: Number(v || 0) }))}
                hint="Higher z = fewer alerts. 2–3 is typical."
              />
              <LabeledInput
                label="Lookback (days)"
                value={alerts.lookback}
                type="number"
                onChange={(v) => setAlerts((a) => ({ ...a, lookback: Number(v || 0) }))}
                hint="Data window for the baseline."
              />
              <LabeledInput
                label="Slack Webhook URL"
                value={alerts.slackWebhook}
                onChange={(v) => setAlerts((a) => ({ ...a, slackWebhook: v }))}
                placeholder="https://hooks.slack.com/services/..."
              />
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, color: COLORS.subtext }}>Digest</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={alerts.digestEnabled}
                    onChange={(e) => setAlerts((a) => ({ ...a, digestEnabled: e.target.checked }))}
                  />
                  Enable digest
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={alerts.digestFrequency}
                    onChange={(e) => setAlerts((a) => ({ ...a, digestFrequency: e.target.value }))}
                    style={{ padding: 8, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <input
                    type="time"
                    value={alerts.digestTime}
                    onChange={(e) => setAlerts((a) => ({ ...a, digestTime: e.target.value }))}
                    style={{ padding: 8, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Button onClick={saveAlerts}>Save Alerts / Digest</Button>
              <Button
                onClick={testSlack}
                disabled={!alerts.slackWebhook}
                title={!alerts.slackWebhook ? "Add Slack webhook URL first" : "Send test"}
                kind="primary"
              >
                Send test to Slack
              </Button>
            </div>
          </div>
        </div>
      )}
    </FrostCard>
  );
}
function LabeledInput({ label, value, onChange, type = "text", placeholder, hint }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 12, color: COLORS.subtext }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        style={{ padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
      />
      {hint ? <span style={{ fontSize: 11, color: COLORS.subtext }}>{hint}</span> : null}
    </div>
  );
}

/* ============================== Premium Gate Wrapper ============================== */
function PremiumGate({ label, premium, children }) {
  if (!premium) {
    return (
      <FrostCard title={`${label} (Premium)`} actions={<Pill color="#6366F1" bg="#EEF2FF" text="Premium required" />}>
        <p style={{ margin: 0, color: COLORS.subtext }}>
          This panel is available on Premium and remains fully implemented behind the gate. No features removed.
        </p>
      </FrostCard>
    );
  }
  return children;
}

/* ============================== END ============================== */
