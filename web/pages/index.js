/* eslint-disable @next/next/no-img-element */
// pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";

/* =============================================================================
   THEME TOKENS (aligned with ORB AI palette + Google brand accents)
   ========================================================================== */
const COLOR = {
  bg: "#ffffff",
  card: "rgba(255,255,255,0.75)",
  cardBorder: "rgba(0,0,0,0.06)",
  frosted: "backdrop-filter: saturate(180%) blur(12px)",
  text: "#0f172a",
  textMuted: "#475569",
  divider: "rgba(0,0,0,0.08)",
  // Google accents
  blue: "#4285F4",
  red: "#EA4335",
  green: "#34A853",
  yellow: "#FBBC05",
};

const btn = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${COLOR.cardBorder}`,
  background: COLOR.blue,
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
const btnSecondary = {
  ...btn,
  background: "#0f172a",
};
const btnGhost = {
  ...btn,
  background: "transparent",
  borderColor: COLOR.divider,
  color: COLOR.text,
};

const badge = (bg, fg) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  background: bg,
  color: fg,
  border: `1px solid ${COLOR.cardBorder}`,
});

/* =============================================================================
   STORAGE KEYS (MUST NOT CHANGE)
   ========================================================================== */
const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";
const KPI_KEY = "insightgpt_kpi_targets_v1";
const ALERTS_KEY = "insightgpt_alerts_cfg_v1"; // keep used by alerts/digest

/* =============================================================================
   HELPERS
   ========================================================================== */
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

/* =============================================================================
   DATA PARSERS + FORMATTING
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
function formatPctDelta(curr, prev) {
  if (prev === 0 && curr === 0) return "0%";
  if (prev === 0) return "+100%";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
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

/* =============================================================================
   CSV HELPERS
   ========================================================================== */
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
  downloadBlob(filename, csv, "text/csv;charset=utf-8;");
}
function downloadCsvGeneric(filenamePrefix, rows, columns) {
  if (!rows?.length) return;
  const header = columns.map((c) => c.header);
  const lines = rows.map((r) => columns.map((c) => r[c.key]));
  const csv = [header, ...lines]
    .map((cols) => cols.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const filename = `${filenamePrefix}.csv`;
  downloadBlob(filename, csv, "text/csv;charset=utf-8;");
}
function downloadBlob(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
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

/* =============================================================================
   KPI TARGETS (LOAD + BADGE)
   ========================================================================== */
function loadKpiTargets() {
  const keys = [KPI_KEY, "kpi_targets_v1"];
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
        ...badge(ok ? "rgba(52,168,83,0.12)" : "rgba(234,67,53,0.12)", ok ? COLOR.green : COLOR.red),
      }}
    >
      {`${pct}% to ${label} target`}
    </span>
  );
}

/* =============================================================================
   PREMIUM GATE (unchanged behavior)
   ========================================================================== */
function getPremiumState() {
  if (typeof window === "undefined") return false;
  // Preserve prior behavior: localStorage flag OR window.InsightGPT.premium
  const ls = localStorage.getItem("insightgpt_premium");
  if (ls === "true") return true;
  const w = window;
  if (w && w.InsightGPT && w.InsightGPT.premium === true) return true;
  return false;
}

/* =============================================================================
   SKELETONS & EMPTY STATES (shimmer)
   ========================================================================== */
function Shimmer({ style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.2s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
// keyframes inline (scoped)
const ShimmerKeyframes = () => (
  <style>{`
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `}</style>
);

function SkeletonTable({ rows = 6, cols = 4, height = 16 }) {
  return (
    <div style={{ border: `1px solid ${COLOR.cardBorder}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: 10, borderBottom: `1px solid ${COLOR.cardBorder}`, background: "rgba(248,250,252,0.6)" }}>
        <Shimmer style={{ height, width: 180, borderRadius: 6 }} />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, padding: 10, borderBottom: `1px solid ${COLOR.cardBorder}` }}>
            {Array.from({ length: cols }).map((__, j) => (
              <Shimmer key={j} style={{ height, borderRadius: 6 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonChart() {
  return <Shimmer style={{ height: 280, borderRadius: 12 }} />;
}

function EmptyState({ title = "No data yet", hint = "Run a report or adjust filters.", action = null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: 24,
        border: `1px dashed ${COLOR.cardBorder}`,
        borderRadius: 12,
        color: COLOR.textMuted,
        background: "rgba(248,250,252,0.5)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 6 }}>{hint}</div>
      {action}
    </div>
  );
}

/* =============================================================================
   STATUS PILL (GA connection) + GA PING
   ========================================================================== */
function StatusPill({ status }) {
  const map = {
    unknown: { bg: "rgba(148,163,184,0.15)", dot: "#94a3b8", text: "Unknown" },
    ok: { bg: "rgba(52,168,83,0.12)", dot: COLOR.green, text: "Connected" },
    error: { bg: "rgba(234,67,53,0.12)", dot: COLOR.red, text: "Not connected" },
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
        background: s.bg,
        border: `1px solid ${COLOR.cardBorder}`,
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: s.dot,
          boxShadow: `0 0 0 2px ${s.bg}`,
        }}
      />
      <span style={{ color: COLOR.textMuted }}>{s.text}</span>
    </span>
  );
}

/* =============================================================================
   MAIN PAGE
   ========================================================================== */
export default function Home() {
  /* ------------------------------ Base Controls ------------------------------ */
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [refreshSignal, setRefreshSignal] = useState(0);

  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");
  const [appliedFilters, setAppliedFilters] = useState({ country: "All", channelGroup: "All" });

  const [dashKey, setDashKey] = useState(1);

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Premium state (unchanged behavior)
  const [isPremium, setIsPremium] = useState(false);

  // GA connection status
  const [gaStatus, setGaStatus] = useState("unknown"); // "unknown" | "ok" | "error"
  const _gaPingAbort = useRef(null);

  // When channels run successfully, scroll to top-of-page section
  const [ranChannelsOnce, setRanChannelsOnce] = useState(false);

  /* ------------------------------ Load from URL ------------------------------ */
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

  /* ------------------------------ Load Preset ------------------------------ */
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

  /* ------------------------------ Persist Preset ------------------------------ */
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

  /* ------------------------------ Premium gate init ------------------------------ */
  useEffect(() => {
    setIsPremium(getPremiumState());
    const handler = () => setIsPremium(getPremiumState());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  /* ------------------------------ GA connection ping (debounced) ------------------------------ */
  async function checkGaConnection(pid) {
    if (!pid) {
      setGaStatus("unknown");
      return;
    }
    try {
      if (_gaPingAbort.current) _gaPingAbort.current.abort();
      _gaPingAbort.current = new AbortController();

      const since = new Date();
      since.setDate(since.getDate() - 7);
      const start = since.toISOString().slice(0, 10);
      const end = new Date().toISOString().slice(0, 10);

      const res = await fetch("/api/ga4/source-medium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: pid, startDate: start, endDate: end, filters: {}, limit: 1 }),
        signal: _gaPingAbort.current.signal,
      });
      if (!res.ok) {
        setGaStatus("error");
        return;
      }
      setGaStatus("ok");
    } catch (e) {
      if (e.name === "AbortError") return;
      setGaStatus("error");
    }
  }
  useEffect(() => {
    const pid = (propertyId || "").trim();
    if (!pid) {
      setGaStatus("unknown");
      return;
    }
    const t = setTimeout(() => checkGaConnection(pid), 300);
    return () => clearTimeout(t);
  }, [propertyId]);

  /* ------------------------------ Channels computed ------------------------------ */
  const { rows, totals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(() => parseGa4Channels(prevResult), [prevResult]);
  const top = rows[0];
  const topShare = top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

  /* ------------------------------ Actions ------------------------------ */
  const connect = () => {
    window.location.href = "/api/auth/google/start";
  };
  const applyFilters = () => {
    setAppliedFilters({ country: countrySel, channelGroup: channelSel });
  };
  async function fetchGa4Channels({ propertyId, startDate, endDate, filters }) {
    return fetchJson("/api/ga4/query", { propertyId, startDate, endDate, filters });
  }
  const runReport = async () => {
    setError("");
    setResult(null);
    setPrevResult(null);
    setLoading(true);
    try {
      const curr = await fetchGa4Channels({ propertyId, startDate, endDate, filters: appliedFilters });
      setResult(curr);

      // Scroll to channel section to confirm action
      setRanChannelsOnce(true);
      try {
        const anchor = document.getElementById("channels-anchor");
        if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}

      try {
        const qs = encodeQuery({ startDate, endDate, appliedFilters, comparePrev });
        const path = window.location.pathname + (qs ? `?${qs}` : "");
        window.history.replaceState(null, "", path);
      } catch {}

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
    setRanChannelsOnce(false);
    try {
      const path = window.location.pathname;
      window.history.replaceState(null, "", path);
    } catch {}
  };

  /* ------------------------------ Render ------------------------------ */
  return (
    <main
      style={{
        padding: 16,
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: 1200,
        margin: "0 auto",
        color: COLOR.text,
      }}
    >
      <ShimmerKeyframes />

      {/* Sticky nav (lighter on mobile) */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          padding: 12,
          margin: "0 -16px 12px",
          background: "rgba(255,255,255,0.85)",
          borderBottom: `1px solid ${COLOR.cardBorder}`,
          // Frosted + condensed on mobile
          backdropFilter: "saturate(160%) blur(8px)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>InsightGPT</h1>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={connect} style={btnSecondary} title="Connect your Google Analytics property">
              Connect Google Analytics
            </button>
            <StatusPill status={gaStatus} />
          </div>

          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            <button onClick={resetDashboard} style={btnGhost} title="Reset all dashboard state (keeps GA connection)">
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <section
        aria-labelledby="controls"
        style={{
          background: COLOR.card,
          border: `1px solid ${COLOR.cardBorder}`,
          borderRadius: 14,
          padding: 14,
        }}
      >
        <h2 id="controls" style={{ margin: "0 0 8px", fontSize: 16 }}>
          Global controls
        </h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label>
            <span style={{ fontSize: 12, color: COLOR.textMuted }}>GA4 Property ID</span>
            <input
              id="property-id"
              name="property-id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="e.g. 123456789"
              style={{
                display: "block",
                padding: 10,
                minWidth: 160,
                borderRadius: 10,
                border: `1px solid ${COLOR.cardBorder}`,
              }}
            />
          </label>

          <label>
            <span style={{ fontSize: 12, color: COLOR.textMuted }}>Start date</span>
            <input
              id="start-date"
              name="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ display: "block", padding: 10, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
            />
          </label>

          <label>
            <span style={{ fontSize: 12, color: COLOR.textMuted }}>End date</span>
            <input
              id="end-date"
              name="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ display: "block", padding: 10, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
            />
          </label>

          <button
            onClick={runReport}
            style={btn}
            disabled={loading || !propertyId}
            title={!propertyId ? "Enter a GA4 property ID first" : "Run GA4 report"}
          >
            {loading ? "Running…" : "Run GA4 Report"}
          </button>

          <label
            style={{
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              paddingLeft: 8,
              borderLeft: `1px solid ${COLOR.cardBorder}`,
            }}
          >
            <input
              id="compare-prev"
              type="checkbox"
              checked={comparePrev}
              onChange={(e) => setComparePrev(e.target.checked)}
            />
            <span style={{ fontSize: 14 }}>Compare vs previous period</span>
          </label>
        </div>

        {/* Filters */}
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px dashed ${COLOR.cardBorder}`,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <b>Filters:</b>
          <label>
            <span style={{ fontSize: 12, color: COLOR.textMuted }}>Country</span>
            <select
              id="country-filter"
              value={countrySel}
              onChange={(e) => setCountrySel(e.target.value)}
              style={{ display: "block", padding: 10, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
            >
              {[
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
              ].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ fontSize: 12, color: COLOR.textMuted }}>Channel Group</span>
            <select
              id="channel-filter"
              value={channelSel}
              onChange={(e) => setChannelSel(e.target.value)}
              style={{ display: "block", padding: 10, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
            >
              {[
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
              ].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <button onClick={applyFilters} style={btnGhost}>
            Apply filters
          </button>

          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>
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
      </section>

      {/* Saved Views (kept behavior & key) */}
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
          setAppliedFilters({ country: view.country || "All", channelGroup: view.channelGroup || "All" });
        }}
        onRunReport={runReport}
        isPremium={isPremium}
      />

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 16 }}>
          Error: {error}
        </p>
      )}

      {/* ============================== Traffic by Default Channel Group (ANCHOR) ============================== */}
      <section
        id="channels-anchor"
        aria-labelledby="channels"
        style={{
          marginTop: 16,
          background: COLOR.card,
          border: `1px solid ${COLOR.cardBorder}`,
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 id="channels" style={{ margin: 0, fontSize: 18 }}>
            Traffic by Default Channel Group
          </h2>
          {/* KPI badge - Sessions */}
          <TargetBadge
            label="Sessions"
            current={Number((totals && totals.sessions) || 0)}
            target={Number(loadKpiTargets()?.sessionsTarget)}
          />
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
          />
          <button
            onClick={() => downloadCsvChannels(rows, totals, startDate, endDate)}
            style={btnGhost}
            disabled={!rows.length}
            title={rows.length ? "Download table as CSV" : "Run a report first"}
          >
            Download CSV
          </button>
        </div>

        {/* Headline stats / skeleton */}
        {!result && loading && (
          <div style={{ marginTop: 12 }}>
            <SkeletonTable rows={2} cols={4} />
          </div>
        )}

        {rows.length > 0 && (
          <ul style={{ marginTop: 12, color: COLOR.textMuted }}>
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
        )}

        {!loading && !rows.length && (
          <EmptyState
            title={ranChannelsOnce ? "No rows in range" : "Run the GA4 report to populate this section"}
            hint={ranChannelsOnce ? "Try expanding the date range or removing filters." : "Use the controls above, then click Run GA4 Report."}
          />
        )}

        {/* Channel table */}
        {rows.length > 0 && (
          <div style={{ marginTop: 8, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <Th>Channel</Th>
                  <Th right>Sessions</Th>
                  <Th right>Users</Th>
                  <Th right>% of Sessions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                  return (
                    <tr key={r.channel}>
                      <Td>{r.channel}</Td>
                      <Td right>{r.sessions.toLocaleString()}</Td>
                      <Td right>{r.users.toLocaleString()}</Td>
                      <Td right>{pct}%</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Chart or skeleton */}
        <div style={{ marginTop: 16 }}>
          {rows.length > 0 ? (
            <img
              src={buildChannelPieUrl(rows)}
              alt="Channel share chart"
              style={{ maxWidth: "100%", height: "auto", border: `1px solid ${COLOR.cardBorder}`, borderRadius: 8 }}
            />
          ) : loading ? (
            <SkeletonChart />
          ) : null}
        </div>
      </section>

      {/* ============================== Source / Medium ============================== */}
      <SourceMedium
        key={`sm-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* ============================== E-commerce KPIs ============================== */}
      <EcommerceKPIs
        key={`ekpi-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* ============================== Checkout funnel ============================== */}
      <CheckoutFunnel
        key={`cf-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* ============================== Top Pages ============================== */}
      <TopPages
        key={`tp-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* ============================== Trends over time (Premium stays same) ============================== */}
      <TrendsOverTime
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        isPremium={isPremium}
      />

      {/* ============================== Campaigns ============================== */}
      <Campaigns propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} isPremium={isPremium} />

      {/* ============================== Campaign drill-down ============================== */}
      <CampaignDrilldown
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        isPremium={isPremium}
      />

      {/* ============================== Campaigns Overview (KPI metrics) ============================== */}
      <CampaignsOverview
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        isPremium={isPremium}
      />

      {/* ============================== Landing Pages × Attribution ============================== */}
      <LandingPages propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} isPremium={isPremium} />

      {/* ============================== Products (flag) ============================== */}
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
          <pre
            style={{
              marginTop: 8,
              background: "#f8fafc",
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${COLOR.cardBorder}`,
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

/* =============================================================================
   SMALL PRIMITIVES
   ========================================================================== */
function Th({ children, right = false }) {
  return (
    <th
      style={{
        textAlign: right ? "right" : "left",
        borderBottom: `1px solid ${COLOR.cardBorder}`,
        padding: 8,
        fontSize: 13,
        color: COLOR.textMuted,
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, right = false }) {
  return (
    <td
      style={{
        padding: 8,
        textAlign: right ? "right" : "left",
        borderBottom: `1px solid ${COLOR.cardBorder}`,
        fontSize: 14,
      }}
    >
      {children}
    </td>
  );
}

/* =============================================================================
   REUSABLE AI BLOCK
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
      <button onClick={run} style={btnGhost} disabled={loading}>
        {loading ? "Summarising…" : asButton ? buttonLabel : "Summarise with AI"}
      </button>
      <button onClick={copy} style={btnGhost} disabled={!text}>
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: COLOR.red }}>Error: {error}</span>}
      {text && (
        <div
          style={{
            marginTop: 8,
            background: "#fffceb",
            border: `1px solid ${COLOR.cardBorder}`,
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

/* =============================================================================
   SAVED VIEWS (Premium gate unchanged)
   ========================================================================== */
function SavedViews({ startDate, endDate, countrySel, channelSel, comparePrev, onApply, onRunReport, isPremium }) {
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);

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
    <section
      aria-labelledby="saved-views"
      style={{
        marginTop: 12,
        padding: 12,
        border: `1px dashed ${COLOR.cardBorder}`,
        borderRadius: 12,
        background: "rgba(251,251,251,0.9)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 id="saved-views" style={{ margin: 0, fontSize: 16 }}>
          Saved Views {isPremium ? null : <span style={{ marginLeft: 6, color: COLOR.textMuted }}>(Premium)</span>}
        </h3>
        <button onClick={() => setOpen((s) => !s)} style={btnGhost}>
          {open ? "Hide" : "Show"} panel
        </button>
        {!isPremium && (
          <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>Upgrade to save custom views</span>
        )}
        {notice && <span style={{ color: COLOR.green, fontSize: 12 }}>{notice}</span>}
      </div>

      {open && (
        <>
          {isPremium ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name this view (e.g. UK · Organic · Sep)"
                  style={{
                    padding: 10,
                    minWidth: 260,
                    borderRadius: 10,
                    border: `1px solid ${COLOR.cardBorder}`,
                  }}
                />
                <button onClick={saveCurrent} style={btnGhost}>
                  Save current
                </button>
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
                        border: `1px solid ${COLOR.cardBorder}`,
                        borderRadius: 10,
                        padding: 8,
                      }}
                    >
                      <div style={{ minWidth: 280 }}>
                        <b>{p.name}</b>{" "}
                        <span style={{ color: COLOR.textMuted, fontSize: 12 }}>
                          {p.startDate} → {p.endDate} · {p.country} · {p.channelGroup}{" "}
                          {p.comparePrev ? "· compare" : ""}
                        </span>
                      </div>
                      <button onClick={() => apply(p, false)} style={btnGhost}>
                        Apply
                      </button>
                      <button onClick={() => apply(p, true)} style={btnGhost}>
                        Apply &amp; Run
                      </button>
                      <button onClick={() => remove(p)} style={{ ...btnGhost, color: COLOR.red }}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No saved views" hint="Create and save a named view to reuse later." />
              )}
            </>
          ) : (
            <EmptyState
              title="Premium required"
              hint="Saved Views are available on premium."
              action={<span style={{ fontSize: 12, color: COLOR.textMuted }}>Use filters &amp; Run to explore for now.</span>}
            />
          )}
        </>
      )}
    </section>
  );
}

/* =============================================================================
   SOURCE / MEDIUM
   ========================================================================== */
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

  const totalSessions = useMemo(() => rows.reduce((sum, r) => sum + (r.sessions || 0), 0), [rows]);
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section
      aria-labelledby="section-sm"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-sm" style={{ margin: 0, fontSize: 18 }}>
          Source / Medium
        </h3>
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Source / Medium"}
        </button>
        {rows.length > 0 && (
          <TargetBadge label="Sessions" current={totalSessions} target={Number(kpiTargets?.sessionsTarget)} />
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
            downloadCsvGeneric(`source_medium_${startDate}_to_${endDate}`, rows, [
              { header: "Source", key: "source" },
              { header: "Medium", key: "medium" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
            ])
          }
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={4} /></div>}

      {!loading && rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Medium</Th>
                <Th right>Sessions</Th>
                <Th right>Users</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.medium}-${i}`}>
                  <Td>{r.source}</Td>
                  <Td>{r.medium}</Td>
                  <Td right>{r.sessions.toLocaleString()}</Td>
                  <Td right>{r.users.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && !error && <EmptyState title="No rows loaded yet" hint="Click Load to fetch Source/Medium." />
      )}
    </section>
  );
}

/* =============================================================================
   CAMPAIGNS (OVERVIEW KPI METRICS)
   ========================================================================== */
function Campaigns({ propertyId, startDate, endDate, filters, isPremium }) {
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
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section
      aria-labelledby="section-campaigns"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-campaigns" style={{ margin: 0, fontSize: 18 }}>
          Campaigns
        </h3>
        {!isPremium && <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>Premium</span>}
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId || !isPremium} title={!isPremium ? "Premium required" : ""}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>
        {rows.length > 0 && (
          <TargetBadge label="Sessions" current={totalSessions} target={Number(kpiTargets?.sessionsTarget)} />
        )}
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "channels", rows, dateRange: { start: startDate, end: endDate }, filters }}
        />
        <button
          onClick={() =>
            downloadCsvGeneric(`campaigns_${startDate}_to_${endDate}`, rows, [
              { header: "Campaign", key: "campaign" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
            ])
          }
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={3} /></div>}

      {!isPremium ? (
        !loading && <EmptyState title="Premium required" hint="Unlock Campaigns with premium." />
      ) : rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th right>Sessions</Th>
                <Th right>Users</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.campaign}-${i}`}>
                  <Td>{r.campaign}</Td>
                  <Td right>{r.sessions.toLocaleString()}</Td>
                  <Td right>{r.users.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && !error && <EmptyState title="No rows loaded yet" hint="Click Load to fetch campaigns." />
      )}
    </section>
  );
}

/* =============================================================================
   CAMPAIGN DRILLDOWN
   ========================================================================== */
function CampaignDrilldown({ propertyId, startDate, endDate, filters, isPremium }) {
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
    <section
      aria-labelledby="section-cd"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-cd" style={{ margin: 0, fontSize: 18 }}>
          Campaign drill-down
        </h3>
        {!isPremium && <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>Premium</span>}
        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="Type exact campaign name…"
          style={{ padding: 10, minWidth: 260, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
          disabled={!isPremium}
        />
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId || !campaign || !isPremium}>
          {loading ? "Loading…" : "Load Campaign Details"}
        </button>

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{
            topic: "campaign-detail",
            campaign,
            totals,
            breakdowns: { sourceMedium: srcMed, adContent: content, term },
            dateRange: { start: startDate, end: endDate },
            filters,
          }}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={2} cols={6} /></div>}

      {!isPremium ? (
        !loading && <EmptyState title="Premium required" hint="Unlock Campaign Drilldown with premium." />
      ) : totals ? (
        <>
          <div style={{ marginTop: 12 }}>
            <b>Totals for &ldquo;{campaign}&rdquo;:</b> Sessions {totals.sessions.toLocaleString()} · Users{" "}
            {totals.users.toLocaleString()} · Transactions {totals.transactions.toLocaleString()} · Revenue{" "}
            {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} · CVR{" "}
            {(cvr || 0).toFixed(2)}% · AOV{" "}
            {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov || 0)}
          </div>

          {srcMed.length > 0 && (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <h4 style={{ margin: "12px 0 6px" }}>By Source / Medium</h4>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <Th>Source</Th>
                    <Th>Medium</Th>
                    <Th right>Sessions</Th>
                    <Th right>Users</Th>
                    <Th right>Transactions</Th>
                    <Th right>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {srcMed.map((r) => (
                    <tr key={r.key}>
                      <Td>{r.d1 || "(not set)"}</Td>
                      <Td>{r.d2 || "(not set)"}</Td>
                      <Td right>{r.sessions.toLocaleString()}</Td>
                      <Td right>{r.users.toLocaleString()}</Td>
                      <Td right>{r.transactions.toLocaleString()}</Td>
                      <Td right>
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                      </Td>
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
                    <Th>Ad Content</Th>
                    <Th right>Sessions</Th>
                    <Th right>Users</Th>
                    <Th right>Transactions</Th>
                    <Th right>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {content.map((r) => (
                    <tr key={r.key}>
                      <Td>{r.content}</Td>
                      <Td right>{r.sessions.toLocaleString()}</Td>
                      <Td right>{r.users.toLocaleString()}</Td>
                      <Td right>{r.transactions.toLocaleString()}</Td>
                      <Td right>
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                      </Td>
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
                    <Th>Term</Th>
                    <Th right>Sessions</Th>
                    <Th right>Users</Th>
                    <Th right>Transactions</Th>
                    <Th right>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {term.map((r) => (
                    <tr key={r.key}>
                      <Td>{r.term}</Td>
                      <Td right>{r.sessions.toLocaleString()}</Td>
                      <Td right>{r.users.toLocaleString()}</Td>
                      <Td right>{r.transactions.toLocaleString()}</Td>
                      <Td right>
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        !loading && !error && (
          <EmptyState title="Enter a campaign and load" hint="Type the exact campaign name and click Load." />
        )
      )}
    </section>
  );
}

/* =============================================================================
   CAMPAIGNS OVERVIEW (KPI METRICS)
   ========================================================================== */
function CampaignsOverview({ propertyId, startDate, endDate, filters, isPremium }) {
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

  const totalSessions = useMemo(() => visible.reduce((sum, r) => sum + (r.sessions || 0), 0), [visible]);
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section
      aria-labelledby="section-cov"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-cov" style={{ margin: 0, fontSize: 18 }}>
          Campaigns (KPI metrics)
        </h3>
        {!isPremium && <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>Premium</span>}
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId || !isPremium} title={!isPremium ? "Premium required" : ""}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search campaign name…"
          style={{ padding: 10, minWidth: 220, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
          disabled={!isPremium}
        />

        {visible.length > 0 && (
          <TargetBadge label="Sessions" current={totalSessions} target={Number(kpiTargets?.sessionsTarget)} />
        )}

        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "campaigns-overview", campaigns: visible, dateRange: { start: startDate, end: endDate }, filters }}
        />

        <button
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
          style={btnGhost}
          disabled={!visible.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}
      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={7} /></div>}

      {!isPremium ? (
        !loading && <EmptyState title="Premium required" hint="Unlock Campaigns (KPI metrics) with premium." />
      ) : visible.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th right>Sessions</Th>
                <Th right>Users</Th>
                <Th right>Transactions</Th>
                <Th right>Revenue</Th>
                <Th right>CVR</Th>
                <Th right>AOV</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key}>
                  <Td>{r.name}</Td>
                  <Td right>{r.sessions.toLocaleString()}</Td>
                  <Td right>{r.users.toLocaleString()}</Td>
                  <Td right>{r.transactions.toLocaleString()}</Td>
                  <Td right>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}</Td>
                  <Td right>{r.cvr.toFixed(2)}%</Td>
                  <Td right>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.aov || 0)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && !error && <EmptyState title="No rows loaded yet" hint="Click Load to fetch campaigns." />
      )}
    </section>
  );
}

/* =============================================================================
   TOP PAGES
   ========================================================================== */
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
    <section
      aria-labelledby="section-tp"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-tp" style={{ margin: 0, fontSize: 18 }}>
          Top pages (views)
        </h3>
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId}>
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
            downloadCsvGeneric(`top_pages_${startDate}_to_${endDate}`, rows, [
              { header: "Title", key: "title" },
              { header: "Path", key: "path" },
              { header: "Views", key: "views" },
              { header: "Users", key: "users" },
            ])
          }
          style={btnGhost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={4} /></div>}

      {!loading && rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th>Page Title</Th>
                <Th>Path</Th>
                <Th right>Views</Th>
                <Th right>Users</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.path}-${i}`}>
                  <Td>{r.title}</Td>
                  <Td>
                    <span style={{ fontFamily: "monospace" }}>{r.path}</span>
                  </Td>
                  <Td right>{r.views.toLocaleString()}</Td>
                  <Td right>{r.users.toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && !error && <EmptyState title="No rows loaded yet" hint="Click Load to fetch top pages." />
      )}
    </section>
  );
}

/* =============================================================================
   LANDING PAGES × ATTRIBUTION (Premium)
   ========================================================================== */
function LandingPages({ propertyId, startDate, endDate, filters, isPremium }) {
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
    <section
      aria-labelledby="section-lp"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-lp" style={{ margin: 0, fontSize: 18 }}>
          Landing Pages × Attribution
        </h3>
        {!isPremium && <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>Premium</span>}
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId || !isPremium} title={!isPremium ? "Premium required" : ""}>
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
        />

        <button onClick={exportCsv} style={btnGhost} disabled={!filtered.length}>
          Download CSV
        </button>
      </div>

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={7} /></div>}
      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {!isPremium ? (
        !loading && <EmptyState title="Premium required" hint="Unlock Landing Pages × Attribution with premium." />
      ) : filtered.length > 0 ? (
        <>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
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
              <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "right" }}>{minSessions}</span>
            </div>

            {rows.length > 0 && (
              <span style={{ fontSize: 12, color: COLOR.textMuted }}>
                Showing <b>{shownCount.toLocaleString()}</b> of {totalCount.toLocaleString()}
              </span>
            )}
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <Th>Landing Page</Th>
                  <Th>Source</Th>
                  <Th>Medium</Th>
                  <Th right>Sessions</Th>
                  <Th right>Users</Th>
                  <Th right>Transactions</Th>
                  <Th right>Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r._k}>
                    <Td>
                      <span style={{ fontFamily: "monospace" }}>{r.landing}</span>
                    </Td>
                    <Td>{r.source}</Td>
                    <Td>{r.medium}</Td>
                    <Td right>{r.sessions.toLocaleString()}</Td>
                    <Td right>{r.users.toLocaleString()}</Td>
                    <Td right>{r.transactions.toLocaleString()}</Td>
                    <Td right>
                      {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !loading && !error && <EmptyState title="No rows loaded yet" hint="Click Load to fetch landing pages." />
      )}
    </section>
  );
}

/* =============================================================================
   E-COMMERCE KPIs
   ========================================================================== */
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
    <section
      aria-labelledby="section-ecom"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-ecom" style={{ margin: 0, fontSize: 18 }}>
          E-commerce KPIs
        </h3>
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
        {totals && (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <TargetBadge label="Sessions" current={Number(totals?.sessions || 0)} target={Number(kpiTargets?.sessionsTarget)} />
            <TargetBadge
              label="Revenue"
              current={Number(totals?.revenue || 0)}
              target={Number(kpiTargets?.revenueTarget)}
              currency
            />
            <TargetBadge label="CVR" current={Number(totals?.cvr || 0)} target={Number(kpiTargets?.cvrTarget)} />
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

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={2} /></div>}

      {!error && totals && !loading && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 560 }}>
            <thead>
              <tr>
                <Th>Metric</Th>
                <Th right>Value</Th>
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

      {!error && !totals && !loading && <EmptyState title="No data loaded yet" hint="Click Load to pull KPIs." />}
    </section>
  );
}
function Tr({ label, value }) {
  const formatted = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value;
  return (
    <tr>
      <Td>{label}</Td>
      <Td right>{formatted}</Td>
    </tr>
  );
}

/* =============================================================================
   CHECKOUT FUNNEL
   ========================================================================== */
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
    <section
      aria-labelledby="section-funnel"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-funnel" style={{ margin: 0, fontSize: 18 }}>
          Checkout funnel (event counts)
        </h3>
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Checkout Funnel"}
        </button>
        <AiBlock
          asButton
          buttonLabel="Summarise with AI"
          endpoint="/api/insights/summarise-pro"
          payload={{ topic: "checkout_funnel", steps, dateRange: { start: startDate, end: endDate }, filters, rates: {} }}
          resetSignal={resetSignal}
        />
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={5} cols={2} /></div>}

      {steps ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 520 }}>
            <thead>
              <tr>
                <Th>Step</Th>
                <Th right>Count</Th>
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
                  <Td>{label}</Td>
                  <Td right>{(val || 0).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && <EmptyState title="No rows loaded yet" hint="Click Load to fetch funnel counts." />
      )}
    </section>
  );
}

/* =============================================================================
   TRENDS OVER TIME (Premium)
   ========================================================================== */
function TrendsOverTime({ propertyId, startDate, endDate, filters, isPremium }) {
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
    <section
      aria-labelledby="section-trend"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-trend" style={{ margin: 0, fontSize: 18 }}>
          Trends over time
        </h3>
        {!isPremium && <span style={badge("rgba(66,133,244,0.08)", COLOR.blue)}>Premium</span>}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Granularity
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            style={{ padding: 8, borderRadius: 10, border: `1px solid ${COLOR.cardBorder}` }}
            disabled={!isPremium}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <button
          onClick={load}
          style={btnGhost}
          disabled={loading || !propertyId || !isPremium}
          title={!isPremium ? "Premium required" : ""}
        >
          {loading ? "Loading…" : "Load Trends"}
        </button>

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
          }}
        />

        <button
          onClick={() =>
            downloadCsvGeneric(`timeseries_${granularity}_${startDate}_to_${endDate}`, rows, [
              { header: "Period", key: "period" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
              { header: "Transactions", key: "transactions" },
              { header: "Revenue", key: "revenue" },
            ])
          }
          style={btnGhost}
          disabled={!hasRows}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonChart /></div>}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows)}
              alt="Sessions & Users trend"
              style={{ maxWidth: "100%", height: "auto", border: `1px solid ${COLOR.cardBorder}`, borderRadius: 8 }}
            />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <Th>Period</Th>
                  <Th right>Sessions</Th>
                  <Th right>Users</Th>
                  <Th right>Transactions</Th>
                  <Th right>Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = displayPeriodLabel(r.period, granularity);
                  return (
                    <tr key={r.period} title={r.period}>
                      <Td>{label}</Td>
                      <Td right>{r.sessions.toLocaleString()}</Td>
                      <Td right>{r.users.toLocaleString()}</Td>
                      <Td right>{r.transactions.toLocaleString()}</Td>
                      <Td right>
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !loading &&
        !error &&
        (!isPremium ? (
          <EmptyState title="Premium required" hint="Unlock trends over time with premium." />
        ) : (
          <EmptyState title="No rows loaded yet" hint="Click Load to fetch the timeseries." />
        ))
      )}
    </section>
  );
}

/* =============================================================================
   PRODUCT PERFORMANCE (flagged by NEXT_PUBLIC_ENABLE_PRODUCTS)
   ========================================================================== */
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

  const exportCsv = () => {
    if (!rows.length) return;
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
  };

  return (
    <section
      aria-labelledby="section-prod"
      style={{
        marginTop: 16,
        background: COLOR.card,
        border: `1px solid ${COLOR.cardBorder}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 id="section-prod" style={{ margin: 0, fontSize: 18 }}>
          Product Performance
        </h3>
        <button onClick={load} style={btnGhost} disabled={loading || !propertyId} title={!propertyId ? "Enter a GA4 property ID first" : ""}>
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
        />

        <button onClick={exportCsv} style={btnGhost} disabled={!rows.length}>
          Download CSV
        </button>

        <span style={{ color: COLOR.textMuted, fontSize: 12 }}>Respects global filters (Country / Channel Group).</span>
      </div>

      {error && (
        <p role="alert" style={{ color: COLOR.red, marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {loading && <div style={{ marginTop: 12 }}><SkeletonTable rows={6} cols={6} /></div>}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Item ID</Th>
                <Th right>Items viewed</Th>
                <Th right>Items added to cart</Th>
                <Th right>Items purchased</Th>
                <Th right>Item revenue</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <Td>{r.name}</Td>
                  <Td>
                    <span style={{ fontFamily: "monospace" }}>{r.id || "—"}</span>
                  </Td>
                  <Td right>{r.views.toLocaleString()}</Td>
                  <Td right>{r.carts.toLocaleString()}</Td>
                  <Td right>{r.purchases.toLocaleString()}</Td>
                  <Td right>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && <EmptyState title="No rows loaded yet" hint="Click Load to fetch product metrics." />
      )}

      {debug && (
        <details style={{ marginTop: 10 }}>
          <summary>Raw products response (debug)</summary>
          <pre
            style={{
              marginTop: 8,
              background: "#f8fafc",
              padding: 12,
              borderRadius: 6,
              border: `1px solid ${COLOR.cardBorder}`,
              overflow: "auto",
            }}
          >
{JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
