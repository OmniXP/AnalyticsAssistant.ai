/* eslint-disable @next/next/no-img-element */

// pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

/* ========================================================================== */
/* THEME (ORB-like + Google colors)                                           */
/* ========================================================================== */
const COLORS = {
  bg: "#ffffff",
  panel: "rgba(255,255,255,0.72)",
  border: "rgba(0,0,0,0.08)",
  text: "#0f172a",
  subtext: "#475569",
  frost: "rgba(255,255,255,0.6)",
  blue: "#4285F4", // Google Blue
  green: "#34A853", // Up
  red: "#EA4335", // Down / error
  amber: "#FBBC05",
  gray: "#E5E7EB",
};

const SHADOW = "0 10px 30px rgba(0,0,0,0.08)";
const RADIUS = 14;

/* ========================================================================== */
/* STORAGE KEYS (must not change)                                             */
/* ========================================================================== */
const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";
const KPI_KEY = "insightgpt_kpi_targets_v1";
const KPI_KEY_ALT = "kpi_targets_v1"; // back-compat
const ALERTS_KEY = "insightgpt_alerts_cfg_v1";

/* ========================================================================== */
/* PREMIUM GATE (strict)                                                      */
/* - No more "Try Alpha".                                                     */
/* - Dev override (session-only) available via console:                       */
/*     sessionStorage.setItem('__dev_premium_session','1')                    */
/*     // remove with: sessionStorage.removeItem('__dev_premium_session')     */
/* ========================================================================== */
function usePremium() {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    // Server should set premium via session/cookie in a real app.
    // Here we strictly default to false. A dev may temporary unlock per session:
    // sessionStorage.setItem('__dev_premium_session','1')
    try {
      const dev = typeof window !== "undefined" && sessionStorage.getItem("__dev_premium_session") === "1";
      setIsPremium(!!dev); // only dev override allowed in MVP
    } catch {
      setIsPremium(false);
    }
  }, []);

  return isPremium;
}

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */
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
  const days = Math.round((end - start) / oneDay) + 1;
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
      data?.error || data?.message || data?.details?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data || {};
}
function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
function pctToTarget(current, target) {
  if (!target || target <= 0) return null;
  return Math.round((current / target) * 100);
}
function loadKpiTargets() {
  try {
    const raw = localStorage.getItem(KPI_KEY) || localStorage.getItem(KPI_KEY_ALT);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function formatPctDelta(curr, prev) {
  if (prev === 0 && curr === 0) return "0%";
  if (prev === 0) return "+100%";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
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

/* ========================================================================== */
/* LAYOUT BLOCKS                                                               */
/* ========================================================================== */
function FrostCard({ title, subtitle, right, children, id, style }) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-h` : undefined}
      style={{
        marginTop: 18,
        padding: 16,
        borderRadius: RADIUS,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        boxShadow: SHADOW,
        backdropFilter: "saturate(140%) blur(8px)",
        WebkitBackdropFilter: "saturate(140%) blur(8px)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 id={id ? `${id}-h` : undefined} style={{ margin: 0, color: COLORS.text }}>
            {title}
          </h3>
          {subtitle ? (
            <p style={{ margin: "4px 0 0", color: COLORS.subtext, fontSize: 13 }}>{subtitle}</p>
          ) : null}
        </div>
        <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {right}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

function Skeleton({ height = 16, width = "100%", radius = 8 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.08) 37%, rgba(0,0,0,0.06) 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.2s ease-in-out infinite",
      }}
    />
  );
}

/* ========================================================================== */
/* PREMIUM GUARD & UPGRADE MODAL                                               */
/* ========================================================================== */
function PremiumTease({ feature, onOpen }) {
  return (
    <div
      role="region"
      aria-label={`${feature} locked`}
      style={{
        position: "relative",
        padding: 18,
        borderRadius: RADIUS,
        border: `1px dashed ${COLORS.border}`,
        background: "#f8fafc",
        color: COLORS.subtext,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.65), rgba(255,255,255,0.9))",
          backdropFilter: "blur(2px)",
          borderRadius: RADIUS,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            borderRadius: 999,
            background: "#eef2ff",
            color: "#3730a3",
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          <LockIcon />
          Premium
        </div>
        <p style={{ margin: "4px 0 8px" }}>
          <b>{feature}</b> is available on Premium. Unlock AI summaries, anomaly alerts delivery,
          advanced attribution &amp; more.
        </p>
        <button
          onClick={onOpen}
          style={{
            background: COLORS.blue,
            color: "#fff",
            border: "none",
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Upgrade to Premium
        </button>
      </div>
    </div>
  );
}
function PremiumGuard({ isPremium, feature, onOpen, children }) {
  if (isPremium) return children;
  return <PremiumTease feature={feature} onOpen={onOpen} />;
}
function UpgradeModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Premium"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 96vw)",
          borderRadius: 16,
          background: COLORS.bg,
          boxShadow: SHADOW,
          border: `1px solid ${COLORS.border}`,
          padding: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Go Premium</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              cursor: "pointer",
              color: COLORS.subtext,
            }}
          >
            &times;
          </button>
        </div>
        <p style={{ color: COLORS.subtext, marginTop: 8 }}>
          Unlock anomaly alerts to Slack, AI digests, advanced campaigns &amp; attribution, saved
          views persistence, and more.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 12,
          }}
        >
          {[
            ["Anomaly alerts to Slack", "Never miss spikes & dips"],
            ["AI performance digests", "Weekly or monthly in Slack"],
            ["Campaign drilldowns", "Revenue, CVR, AOV slices"],
            ["Saved views", "Shareable presets & filters"],
          ].map(([h, s]) => (
            <div
              key={h}
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 12,
                background: "#fcfcff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckIcon color={COLORS.green} />
                <b>{h}</b>
              </div>
              <div style={{ color: COLORS.subtext, fontSize: 13, marginTop: 6 }}>{s}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <a
            href="/upgrade"
            style={{
              background: COLORS.blue,
              color: "#fff",
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 600,
            }}
          >
            Upgrade
          </a>
          <a
            href="mailto:hello@insightgpt.ai?subject=Upgrade%20request"
            style={{
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 600,
              background: "#fff",
            }}
          >
            Talk to sales
          </a>
          <div style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: COLORS.subtext }}>
            Tip for devs: run <code>sessionStorage.setItem(&quot;__dev_premium_session&quot;,&quot;1&quot;)</code> to
            test Premium in this session.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* ICONS                                                                       */
/* ========================================================================== */
function LockIcon({ size = 14, color = "#3730a3" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1Zm2 0h8V8a4 4 0 0 0-8 0v2Z" />
    </svg>
  );
}
function CheckIcon({ size = 16, color = COLORS.green }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color} aria-hidden="true">
      <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.25 7.25a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L8.5 11.086l6.543-6.543a1 1 0 0 1 1.414 0Z" />
    </svg>
  );
}

/* ========================================================================== */
/* AI BLOCK                                                                    */
/* ========================================================================== */
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
      <button
        onClick={run}
        style={{ padding: "8px 12px", cursor: "pointer", background: COLORS.blue, color: "#fff", border: 0, borderRadius: 10 }}
        disabled={loading}
      >
        {loading ? "Summarising…" : asButton ? buttonLabel : "Summarise with AI"}
      </button>
      <button
        onClick={copy}
        style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
        disabled={!text}
      >
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: COLORS.red }}>Error: {error}</span>}
      {text && (
        <div
          style={{
            marginTop: 8,
            background: "#fffceb",
            border: "1px solid #f5e08f",
            padding: 10,
            borderRadius: 10,
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

/* ========================================================================== */
/* PAGE                                                                        */
/* ========================================================================== */
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

export default function Home() {
  const isPremium = usePremium();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Connection status (visual: green if propertyId present)
  const [propertyId, setPropertyId] = useState("");
  const isConnected = !!propertyId;

  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");
  const [appliedFilters, setAppliedFilters] = useState({ country: "All", channelGroup: "All" });

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // UX signals & skeletons
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [dashKey, setDashKey] = useState(1);

  // Focus target (after first report show channels at top)
  const channelsRef = useRef(null);

  /* -------------------- URL & Preset load/save -------------------- */
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

      // scroll to channels
      setTimeout(() => {
        if (channelsRef.current) channelsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
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
    try {
      const path = window.location.pathname;
      window.history.replaceState(null, "", path);
    } catch {}
  };

  /* -------------------- KPI Targets (premium) -------------------- */
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
          color: ok ? COLORS.green : COLORS.red,
          border: `1px solid ${ok ? "#b7e1cd" : "#f4c7c3"}`,
        }}
      >
        {`${pct}% to ${label} target`}
      </span>
    );
  }

  /* -------------------- Alerts/Digest (premium) -------------------- */
  const [alertsUIOpen, setAlertsUIOpen] = useState(false);

  /* ======================================================================== */
  /* RENDER                                                                    */
  /* ======================================================================== */
  return (
    <main
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: 1160,
        margin: "0 auto",
        color: COLORS.text,
      }}
    >
      {/* Sticky header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0.6))",
          backdropFilter: "saturate(140%) blur(8px)",
          WebkitBackdropFilter: "saturate(140%) blur(8px)",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, letterSpacing: 0.2 }}>InsightGPT</h1>

          {/* Connection status */}
          <span
            aria-live="polite"
            style={{
              marginLeft: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              borderRadius: 999,
              background: isConnected ? "#e6f4ea" : "#fdecea",
              color: isConnected ? COLORS.green : COLORS.red,
              border: `1px solid ${isConnected ? "#b7e1cd" : "#f4c7c3"}`,
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: isConnected ? COLORS.green : COLORS.red,
                boxShadow: `0 0 0 2px rgba(0,0,0,0.04) inset`,
              }}
              aria-hidden="true"
            />
            {isConnected ? "Connected to Google Analytics" : "Not connected"}
          </span>

          <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            <button
              onClick={connect}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                background: COLORS.blue,
                color: "#fff",
                border: 0,
                borderRadius: 10,
              }}
              aria-label="Connect Google Analytics"
            >
              Connect Google Analytics
            </button>
            <button
              onClick={resetDashboard}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
                background: "#fff",
              }}
              aria-label="Reset dashboard"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Controls */}
      <FrostCard
        title="Controls"
        subtitle="Connect GA4, choose a date range, optionally apply filters, and run."
        right={
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                id="compare-prev"
                type="checkbox"
                checked={comparePrev}
                onChange={(e) => setComparePrev(e.target.checked)}
              />
              Compare vs previous period
            </label>
            <button
              onClick={runReport}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                background: COLORS.blue,
                color: "#fff",
                border: 0,
                borderRadius: 10,
              }}
              disabled={loading || !propertyId}
            >
              {loading ? "Running…" : "Run GA4 Report"}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(180px, 1fr))" }}>
          <label>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>GA4 Property ID</div>
            <input
              id="property-id"
              name="property-id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="e.g. 123456789"
              style={{
                padding: 10,
                width: "100%",
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Start date</div>
            <input
              id="start-date"
              name="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: 10, width: "100%", borderRadius: 10, border: `1px solid ${COLORS.border}` }}
            />
          </label>
          <label>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>End date</div>
            <input
              id="end-date"
              name="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: 10, width: "100%", borderRadius: 10, border: `1px solid ${COLORS.border}` }}
            />
          </label>
          <div />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <label>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Country</div>
            <select
              id="country-filter"
              value={countrySel}
              onChange={(e) => setCountrySel(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Channel Group</div>
            <select
              id="channel-filter"
              value={channelSel}
              onChange={(e) => setChannelSel(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
            >
              {CHANNEL_GROUP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={applyFilters}
            style={{
              padding: "10px 14px",
              cursor: "pointer",
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
            }}
          >
            Apply filters
          </button>

          {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
            <span
              style={{
                background: "#e6f4ea",
                color: COLORS.green,
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                border: "1px solid #b7e1cd",
              }}
            >
              {`Filters active: `}
              {appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}
              {appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}
              {appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}
            </span>
          )}
          <span style={{ color: COLORS.subtext, fontSize: 12 }}>
            Filters apply when you run a section (e.g., GA4 Report / Load buttons).
          </span>
        </div>
      </FrostCard>

      {/* Saved Views — Premium */}
      <FrostCard
        title="Saved Views"
        subtitle="Save your date and filter presets for quick recall."
        right={null}
      >
        <PremiumGuard
          isPremium={isPremium}
          feature="Saved Views"
          onOpen={() => setUpgradeOpen(true)}
        >
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
        </PremiumGuard>
      </FrostCard>

      {/* KPI Targets & Alerts / Digest — Premium, with Show Settings CTA */}
      <FrostCard
        title="KPI Targets &amp; Alerts / Digest"
        subtitle="Track against goals and get anomaly alerts."
        right={
          <button
            onClick={() => setAlertsUIOpen((v) => !v)}
            style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
          >
            {alertsUIOpen ? "Hide settings" : "Show settings"}
          </button>
        }
      >
        <PremiumGuard
          isPremium={isPremium}
          feature="KPI Targets & Alerts / Digest"
          onOpen={() => setUpgradeOpen(true)}
        >
          {alertsUIOpen ? (
            <KpiTargetsAndAlertsPanel
              startDate={startDate}
              endDate={endDate}
              filters={appliedFilters}
              propertyId={propertyId}
            />
          ) : (
            <p style={{ color: COLORS.subtext, margin: 0 }}>
              Click &quot;Show settings&quot; to manage KPI targets, anomaly detection and Slack digest.
            </p>
          )}
        </PremiumGuard>
      </FrostCard>

      {/* ================================================================ */}
      {/*  TRAFFIC BY DEFAULT CHANNEL GROUP (Hero)                         */}
      {/* ================================================================ */}
      <FrostCard
        id="channels"
        title="Traffic by Default Channel Group"
        subtitle="Sessions &amp; users by channel."
        right={
          <>
            {/* KPI badge for Sessions (hero) — if premium, show progress */}
            {isPremium && (
              <TargetBadge
                label="Sessions"
                current={Number(totals?.sessions || 0)}
                target={Number(loadKpiTargets()?.sessionsTarget)}
              />
            )}
            <button
              onClick={() => downloadCsvGeneric(`ga4_channels_${startDate}_to_${endDate}`, rows, [
                { header: "Channel", key: "channel" },
                { header: "Sessions", key: "sessions" },
                { header: "Users", key: "users" },
              ])}
              style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
              disabled={!rows.length}
              title={rows.length ? "Download table as CSV" : "Run a report first"}
            >
              Download CSV
            </button>
            <AiBlock
              asButton
              buttonLabel="Summarise with AI"
              endpoint="/api/insights/summarise-pro"
              payload={{ topic: "channels", rows, totals, dateRange: { start: startDate, end: endDate }, filters: appliedFilters }}
              resetSignal={refreshSignal}
            />
          </>
        }
      >
        <div ref={channelsRef} />
        {error && <p style={{ color: COLORS.red, marginTop: 8 }}>Error: {error}</p>}
        {loading && !rows.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            <Skeleton height={18} width="60%" />
            <Skeleton height={140} />
            <Skeleton height={18} width="40%" />
          </div>
        ) : rows.length > 0 ? (
          <>
            <ul style={{ marginTop: 12, paddingLeft: 18 }}>
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
                    <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Channel</th>
                    <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                    <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                    <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>% of Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pct = totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                    return (
                      <tr key={r.channel}>
                        <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.channel}</td>
                        <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                          {r.sessions.toLocaleString()}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                          {r.users.toLocaleString()}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16 }}>
              {/* Using <img> because quickchart.io may not be allowed in next/image domain list */}
              <img
                src={buildChannelPieUrl(rows)}
                alt="Channel share chart"
                style={{ maxWidth: "100%", height: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
              />
            </div>
          </>
        ) : (
          !error && <p style={{ color: COLORS.subtext, marginTop: 8 }}>Run a GA4 report to see channels.</p>
        )}
      </FrostCard>

      {/* ================================================================ */}
      {/* ORDER AS REQUESTED                                               */}
      {/* 1. Top Pages (views)                                             */}
      {/* ================================================================ */}
      <TopPages
        key={`tp-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 2. Source / Medium */}
      <SourceMedium
        key={`sm-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 3. E-commerce KPIs */}
      <EcommerceKPIs
        key={`ekpi-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
        isPremium={isPremium}
      />

      {/* 4. Checkout funnel */}
      <CheckoutFunnel
        key={`cf-${dashKey}`}
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
        resetSignal={refreshSignal}
      />

      {/* 6. Trends over time — Premium */}
      <PremiumGuard
        isPremium={isPremium}
        feature="Trends over time"
        onOpen={() => setUpgradeOpen(true)}
      >
        <TrendsOverTime propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </PremiumGuard>

      {/* 7. Campaigns — Premium */}
      <PremiumGuard isPremium={isPremium} feature="Campaigns" onOpen={() => setUpgradeOpen(true)}>
        <Campaigns propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </PremiumGuard>

      {/* 8. Campaign drill-down — Premium */}
      <PremiumGuard isPremium={isPremium} feature="Campaign drill-down" onOpen={() => setUpgradeOpen(true)}>
        <CampaignDrilldown propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </PremiumGuard>

      {/* 9. Campaigns (KPI metrics) — Premium (renamed) */}
      <PremiumGuard isPremium={isPremium} feature="Campaigns (KPI metrics)" onOpen={() => setUpgradeOpen(true)}>
        <CampaignsOverview
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          titleOverride="Campaigns (KPI metrics)"
        />
      </PremiumGuard>

      {/* 10. Landing Pages × Attribution — Premium */}
      <PremiumGuard
        isPremium={isPremium}
        feature="Landing Pages × Attribution"
        onOpen={() => setUpgradeOpen(true)}
      >
        <LandingPages propertyId={propertyId} startDate={startDate} endDate={endDate} filters={appliedFilters} />
      </PremiumGuard>

      {/* Products — behind env flag */}
      {process.env.NEXT_PUBLIC_ENABLE_PRODUCTS === "true" && (
        <Products
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          resetSignal={refreshSignal}
        />
      )}

      {/* Raw JSON debug */}
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
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {safeStringify(result)}
          </pre>
        </details>
      ) : null}

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      <style jsx global>{`
        @keyframes shimmer {
          0% {
            background-position: -468px 0;
          }
          100% {
            background-position: 468px 0;
          }
        }
      `}</style>
    </main>
  );
}

/* ========================================================================== */
/* SAVED VIEWS (Premium)                                                       */
/* ========================================================================== */
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
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view (e.g. UK · Organic · Sep)"
          style={{ padding: 10, minWidth: 260, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
        />
        <button onClick={saveCurrent} style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
          Save current
        </button>
        {notice && <span style={{ color: COLORS.green, fontSize: 12 }}>{notice}</span>}
      </div>

      {presets.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {presets.map((p) => (
            <div key={p.name} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 280 }}>
                <b>{p.name}</b>{" "}
                <span style={{ color: COLORS.subtext, fontSize: 12 }}>
                  {p.startDate} → {p.endDate} · {p.country} · {p.channelGroup} {p.comparePrev ? "· compare" : ""}
                </span>
              </div>
              <button onClick={() => apply(p, false)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                Apply
              </button>
              <button onClick={() => apply(p, true)} style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
                Apply &amp; Run
              </button>
              <button
                onClick={() => remove(p)}
                style={{ padding: "6px 10px", cursor: "pointer", color: COLORS.red, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ marginTop: 8, color: COLORS.subtext, fontSize: 13 }}>
          No saved views yet. Set dates/filters, give it a name, then &quot;Save current&quot;.
        </p>
      )}
    </div>
  );
}

/* ========================================================================== */
/* KPI TARGETS + ALERTS / DIGEST (Premium)                                     */
/* ========================================================================== */
function KpiTargetsAndAlertsPanel({ startDate, endDate, filters, propertyId }) {
  const [targets, setTargets] = useState({ sessionsTarget: "", revenueTarget: "", cvrTarget: "" });
  const [notice, setNotice] = useState("");

  // Anomaly settings
  const [sensitivity, setSensitivity] = useState(2); // z
  const [lookback, setLookback] = useState(28);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [digestFreq, setDigestFreq] = useState("weekly");
  const [digestTime, setDigestTime] = useState("09:00");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KPI_KEY) || localStorage.getItem(KPI_KEY_ALT);
      if (raw) {
        const parsed = JSON.parse(raw);
        setTargets({
          sessionsTarget: parsed.sessionsTarget ?? "",
          revenueTarget: parsed.revenueTarget ?? "",
          cvrTarget: parsed.cvrTarget ?? "",
        });
      }
      const aRaw = localStorage.getItem(ALERTS_KEY);
      if (aRaw) {
        const cfg = JSON.parse(aRaw);
        setSensitivity(cfg.z ?? 2);
        setLookback(cfg.lookbackDays ?? 28);
        setSlackWebhook(cfg.slackWebhook ?? "");
        setDigestFreq(cfg.digestFreq ?? "weekly");
        setDigestTime(cfg.digestTime ?? "09:00");
      }
    } catch {}
  }, []);

  const saveTargets = () => {
    try {
      localStorage.setItem(
        KPI_KEY,
        JSON.stringify({
          sessionsTarget: Number(targets.sessionsTarget || 0),
          revenueTarget: Number(targets.revenueTarget || 0),
          cvrTarget: Number(targets.cvrTarget || 0),
        })
      );
      setNotice("Targets saved.");
      setTimeout(() => setNotice(""), 1200);
    } catch {
      setNotice("Could not save.");
      setTimeout(() => setNotice(""), 1200);
    }
  };

  const saveAlerts = () => {
    try {
      localStorage.setItem(
        ALERTS_KEY,
        JSON.stringify({
          z: Number(sensitivity || 2),
          lookbackDays: Number(lookback || 28),
          slackWebhook: slackWebhook || "",
          digestFreq,
          digestTime,
        })
      );
      setNotice("Alerts/digest saved.");
      setTimeout(() => setNotice(""), 1200);
    } catch {
      setNotice("Could not save.");
      setTimeout(() => setNotice(""), 1200);
    }
  };

  const sendTestSlack = async () => {
    if (!slackWebhook) {
      setNotice("Add a Slack webhook first.");
      setTimeout(() => setNotice(""), 1500);
      return;
    }
    try {
      const r = await fetch("/api/slack/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook: slackWebhook,
          test: true,
          propertyId,
          startDate,
          endDate,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNotice("Test sent to Slack.");
      setTimeout(() => setNotice(""), 1500);
    } catch (e) {
      setNotice(`Slack test failed: ${String(e.message || e)}`);
      setTimeout(() => setNotice(""), 1800);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          alignItems: "start",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>KPI Targets</div>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Sessions</div>
              <input
                inputMode="numeric"
                value={targets.sessionsTarget}
                onChange={(e) => setTargets((t) => ({ ...t, sessionsTarget: e.target.value }))}
                placeholder="e.g. 100000"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Revenue (GBP)</div>
              <input
                inputMode="numeric"
                value={targets.revenueTarget}
                onChange={(e) => setTargets((t) => ({ ...t, revenueTarget: e.target.value }))}
                placeholder="e.g. 250000"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>CVR (%)</div>
              <input
                inputMode="decimal"
                value={targets.cvrTarget}
                onChange={(e) => setTargets((t) => ({ ...t, cvrTarget: e.target.value }))}
                placeholder="e.g. 2.5"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              />
            </label>
          </div>
          <button
            onClick={saveTargets}
            style={{
              marginTop: 10,
              background: COLORS.blue,
              color: "#fff",
              border: 0,
              padding: "8px 12px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Save targets
          </button>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Anomaly Alerts</div>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Sensitivity (z)</div>
              <input
                inputMode="numeric"
                min={1}
                step="0.5"
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                placeholder="2"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Lookback days</div>
              <input
                inputMode="numeric"
                min={7}
                value={lookback}
                onChange={(e) => setLookback(Number(e.target.value))}
                placeholder="28"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Slack webhook</div>
              <input
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}`, fontFamily: "monospace" }}
              />
            </label>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Performance Digest (Slack)</div>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Frequency</div>
              <select
                value={digestFreq}
                onChange={(e) => setDigestFreq(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 12, color: COLORS.subtext, marginBottom: 4 }}>Time (local)</div>
              <input
                type="time"
                value={digestTime}
                onChange={(e) => setDigestTime(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
              />
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={saveAlerts}
          style={{
            background: "#fff",
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Save alerts/digest
        </button>
        <button
          onClick={sendTestSlack}
          style={{
            background: COLORS.blue,
            color: "#fff",
            border: 0,
            padding: "8px 12px",
            borderRadius: 10,
            cursor: "pointer",
          }}
          disabled={!slackWebhook}
          title={!slackWebhook ? "Add a Slack webhook to test" : "Send a test to Slack"}
        >
          Send test to Slack
        </button>
        {notice && <span style={{ alignSelf: "center", color: COLORS.green }}>{notice}</span>}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* SOURCE / MEDIUM                                                             */
/* ========================================================================== */
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

  return (
    <FrostCard
      title="Source / Medium"
      subtitle="Acquisition sources and mediums driving sessions."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <button
            onClick={() =>
              downloadCsvGeneric(`source_medium_${startDate}_to_${endDate}`, rows, [
                { header: "Source", key: "source" },
                { header: "Medium", key: "medium" },
                { header: "Sessions", key: "sessions" },
                { header: "Users", key: "users" },
              ])
            }
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!rows.length}
          >
            Download CSV
          </button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{ topic: "source_medium", rows, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.red }}>Error: {error}</p>}
      {loading && !rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <div style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 6 }}>
            Total sessions: <b>{totalSessions.toLocaleString()}</b>
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Source</th>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Medium</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.source}-${r.medium}-${i}`}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.source}</td>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.medium}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ color: COLORS.subtext, marginTop: 8 }}>No rows loaded yet.</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* CAMPAIGNS (overview)  — Premium                                             */
/* ========================================================================== */
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

  return (
    <FrostCard
      title="Campaigns"
      subtitle="Sessions and users by campaign."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <button
            onClick={() =>
              downloadCsvGeneric(`campaigns_${startDate}_to_${endDate}`, rows, [
                { header: "Campaign", key: "campaign" },
                { header: "Sessions", key: "sessions" },
                { header: "Users", key: "users" },
              ])
            }
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!rows.length}
          >
            Download CSV
          </button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{ topic: "channels", rows, dateRange: { start: startDate, end: endDate }, filters }}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.red }}>Error: {error}</p>}
      {loading && !rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <div style={{ color: COLORS.subtext, fontSize: 12, marginBottom: 6 }}>
            Total sessions: <b>{totalSessions.toLocaleString()}</b>
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Campaign</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.campaign}-${i}`}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.campaign}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* CAMPAIGN DRILLDOWN — Premium                                                */
/* ========================================================================== */
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
      subtitle="Deep dive into a single campaign."
      right={
        <>
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="Type exact campaign name…"
            style={{ padding: 8, minWidth: 260, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
          />
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId || !campaign}
          >
            {loading ? "Loading…" : "Load details"}
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
        </>
      }
    >
      {error && <p style={{ color: COLORS.red, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {totals ? (
        <div style={{ marginTop: 12 }}>
          <b>Totals for &quot;{campaign}&quot;:</b> Sessions {totals.sessions.toLocaleString()} · Users{" "}
          {totals.users.toLocaleString()} · Transactions {totals.transactions.toLocaleString()} · Revenue{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)} · CVR{" "}
          {(cvr || 0).toFixed(2)}% · AOV{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov || 0)}
        </div>
      ) : (
        !error && <p style={{ color: COLORS.subtext }}>Enter a campaign name and click &quot;Load details&quot;.</p>
      )}

      {srcMed.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Source / Medium</h4>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Source</th>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Medium</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {srcMed.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.d1 || "(not set)"}</td>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.d2 || "(not set)"}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.transactions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
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
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Ad Content</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {content.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.content}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.transactions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
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
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Term</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {term.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.term}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.transactions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
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

/* ========================================================================== */
/* CAMPAIGNS OVERVIEW (renamed KPI metrics) — Premium                          */
/* ========================================================================== */
function CampaignsOverview({ propertyId, startDate, endDate, filters, titleOverride = "Campaigns (KPI metrics)" }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setRows([]);
    try {
      const data = await fetchJson("/api/ga4/campaigns", { propertyId, startDate, endDate, filters, limit: 100 });
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

  return (
    <FrostCard
      title={titleOverride}
      subtitle="Revenue, CVR and AOV by campaign."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaign name…"
            style={{ padding: 8, minWidth: 220, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
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
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!visible.length}
          >
            Download CSV
          </button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{ topic: "campaigns-overview", campaigns: visible, dateRange: { start: startDate, end: endDate }, filters }}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.red }}>{error}</p>}
      {loading && !rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : visible.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Campaign</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Transactions</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Revenue</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>CVR</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>AOV</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.name}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.sessions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.transactions.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.cvr.toFixed(2)}%
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.aov || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* TOP PAGES                                                                   */
/* ========================================================================== */
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
    <FrostCard
      title="Top pages (views)"
      subtitle="Page views and users by page."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <button
            onClick={() =>
              downloadCsvGeneric(`top_pages_${startDate}_to_${endDate}`, rows, [
                { header: "Title", key: "title" },
                { header: "Path", key: "path" },
                { header: "Views", key: "views" },
                { header: "Users", key: "users" },
              ])
            }
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!rows.length}
          >
            Download CSV
          </button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{ topic: "pages", rows, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.red }}>Error: {error}</p>}
      {loading && !rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Page Title</th>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Path</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Views</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.path}-${i}`}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.title}</td>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}`, fontFamily: "monospace" }}>{r.path}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.views.toLocaleString()}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {r.users.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* LANDING PAGES × ATTRIBUTION — Premium                                       */
/* ========================================================================== */
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
    <FrostCard
      title="Landing Pages × Attribution"
      subtitle="Where users land vs. which sources drive outcomes."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <button
            onClick={exportCsv}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!filtered.length}
          >
            Download CSV
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
        </>
      }
    >
      {error && <p style={{ color: COLORS.red, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {loading && !rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : filtered.length > 0 ? (
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
              <span style={{ fontSize: 12, color: COLORS.subtext }}>
                Showing <b>{filtered.length.toLocaleString()}</b> of {rows.length.toLocaleString()}
              </span>
            )}
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Landing Page</th>
                  <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Source</th>
                  <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Medium</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Transactions</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r._k}>
                    <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}`, fontFamily: "monospace" }}>{r.landing}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.source}</td>
                    <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.medium}</td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                      {r.sessions.toLocaleString()}
                    </td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                      {r.users.toLocaleString()}
                    </td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                      {r.transactions.toLocaleString()}
                    </td>
                    <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                      {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>{rows.length ? "No rows match your view filters." : "No rows loaded yet."}</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* E-COMMERCE KPIs                                                             */
/* ========================================================================== */
function EcommerceKPIs({ propertyId, startDate, endDate, filters, resetSignal, isPremium }) {
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
      const data = await fetchJson("/api/ga4/ecommerce-summary", { propertyId, startDate, endDate, filters });
      setTotals(data?.totals || null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const kpiTargets = useMemo(() => (isPremium ? loadKpiTargets() : {}), [isPremium]);

  return (
    <FrostCard
      title="E-commerce KPIs"
      subtitle="Key purchase metrics and ratios."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          {totals && isPremium && (
            <>
              <TargetBadge label="Sessions" current={Number(totals?.sessions || 0)} target={Number(kpiTargets?.sessionsTarget)} />
              <TargetBadge label="Revenue" current={Number(totals?.revenue || 0)} target={Number(kpiTargets?.revenueTarget)} currency />
              <TargetBadge label="CVR" current={Number(totals?.cvr || 0)} target={Number(kpiTargets?.cvrTarget)} />
            </>
          )}
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pro"
            payload={{ topic: "ecom_kpis", totals, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.red, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {loading && !totals ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : !error && totals ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Metric</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Value</th>
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
      ) : (
        !error && <p style={{ color: COLORS.subtext }}>No data loaded yet.</p>
      )}
    </FrostCard>
  );
}
function Tr({ label, value }) {
  const formatted = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : value;
  return (
    <tr>
      <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{label}</td>
      <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>{formatted}</td>
    </tr>
  );
}

/* ========================================================================== */
/* CHECKOUT FUNNEL                                                             */
/* ========================================================================== */
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
      subtitle="Event counts across the purchase journey."
      right={
        <>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-funnel"
            payload={{ steps, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.red, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {loading && !steps ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : steps ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 520 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Step</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Count</th>
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
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{label}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {(val || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* TRENDS OVER TIME — Premium                                                  */
/* ========================================================================== */
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
    <FrostCard
      title="Trends over time"
      subtitle="Sessions and users over time."
      right={
        <>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Granularity
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              style={{ padding: 6, borderRadius: 10, border: `1px solid ${COLORS.border}` }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <button
            onClick={load}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={loading || !propertyId}
            title={!propertyId ? "Enter a GA4 property ID first" : ""}
          >
            {loading ? "Loading…" : "Load"}
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
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!hasRows}
          >
            Download CSV
          </button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.red, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {loading && !hasRows ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={300} />
        </div>
      ) : hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <img
              src={buildLineChartUrl(rows)}
              alt="Sessions & Users trend"
              style={{ maxWidth: "100%", height: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8 }}
            />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Period</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Sessions</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Users</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Transactions</th>
                  <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = displayPeriodLabel(r.period, granularity);
                  return (
                    <tr key={r.period} title={r.period}>
                      <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{label}</td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                        {r.sessions.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                        {r.users.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                        {r.transactions.toLocaleString()}
                      </td>
                      <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
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
        !error && <p style={{ color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* PRODUCTS (env flag)                                                         */
/* ========================================================================== */
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
    <FrostCard
      title="Product Performance"
      subtitle="Views, carts, and revenue by item."
      right={
        <>
          <button
            onClick={load}
            style={{
              padding: "8px 12px",
              cursor: "pointer",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
            }}
            disabled={loading || !propertyId}
            title={!propertyId ? "Enter a GA4 property ID first" : ""}
          >
            {loading ? "Loading…" : "Load"}
          </button>
          <button
            onClick={exportCsv}
            style={{ padding: "8px 12px", cursor: "pointer", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff" }}
            disabled={!rows.length}
          >
            Download CSV
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
        </>
      }
    >
      {error && <p style={{ color: COLORS.red, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {loading && !rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={140} />
        </div>
      ) : rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Item</th>
                <th style={{ textAlign: "left", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Item ID</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Items viewed</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Items added to cart</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Items purchased</th>
                <th style={{ textAlign: "right", borderBottom: `1px solid ${COLORS.border}`, padding: 8 }}>Item revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}` }}>{r.name}</td>
                  <td style={{ padding: 8, borderBottom: `1px solid ${COLORS.border}`, fontFamily: "monospace" }}>{r.id || "—"}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>{r.views.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>{r.carts.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>{r.purchases.toLocaleString()}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: `1px solid ${COLORS.border}` }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(r.revenue || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
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
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      )}
    </FrostCard>
  );
}

/* ========================================================================== */
/* CHANGE LOG / COMPAT / ASSUMPTIONS                                           */
/* ========================================================================== */
// Change Log
// - Added strict Premium gate with Upgrade modal and session-only dev override.
// - Wrapped premium features with <PremiumGuard/>: Saved Views, Trends, Campaigns, Campaign Drilldown,
//   Campaigns (KPI metrics), Landing Pages × Attribution, KPI Targets & Alerts / Digest.
// - Kept all previous features and API contracts intact.
// - Refreshed UI to ORB-like frosted cards and Google color accents.
// - Added GA connection status badge (green/red) tied to presence of propertyId.
// - Added skeleton loaders & polished empty states across sections.
// - Renamed "Campaigns (overview)" to "Campaigns (KPI metrics)" (label only, API unchanged).
//
// Compatibility Notes
// - Uses <img> for QuickChart charts because next/image may require domain config; lint rule
//   is disabled at file head to avoid build break. Everything else follows Next.js best practices.
// - Premium dev override is session-only: run
//   sessionStorage.setItem("__dev_premium_session","1")
//   to unlock for the current tab session. It is intentionally not persisted across tabs/reloads.
//
// Assumptions
// - Server-side premium entitlements are not yet wired; this client-only gate is intentional for MVP.
// - Existing API endpoints respond with the same shapes as previously used in your project.
// - Product feature is controlled by NEXT_PUBLIC_ENABLE_PRODUCTS env flag as before.
