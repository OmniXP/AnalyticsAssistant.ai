/* eslint-disable @next/next/no-img-element */
// pages/index.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ChatWidget from "../components/ai-chat/ChatWidget";
import { trackEvent } from "../lib/analytics";

/**
 * ============================================================================
 * AnalyticsAssistant Dashboard — GA4-first UX with robust GA session status + CTAs
 * - Keeps your working OAuth + run report flow intact.
 * - Fixes the other panels by switching to header‑aware parsing so metric/dimension
 *   order does not matter and Google changes do not break the UI.
 * - Zero dependency changes; client-only.
 * ============================================================================
 */

/* ============================== Constants ============================== */
const STORAGE_KEY = "insightgpt_preset_v2";
const SAVED_VIEWS_KEY = "insightgpt_saved_views_v1";
const KPI_TARGETS_KEY = "insightgpt_kpi_targets_v1";
const ALERTS_CFG_KEY = "insightgpt_alerts_cfg_v1";
const PREMIUM_FLAG_KEY = "insightgpt_premium_flag_v1"; // "Alpha" or "Pro"
const FREE_USAGE_LIMITS = { ga4: 25, ai: 10 };
const PREMIUM_USAGE_LIMITS = { ga4: 3000, ai: 100 };
const FREE_DATE_WINDOW_DAYS = 90;
const FREE_PROPERTY_LIMIT = 1;
const PRO_PROPERTY_LIMIT = 5;
const PREMIUM_LANDING_PATH = process.env.NEXT_PUBLIC_PREMIUM_URL || "/premium";
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_PRESETS = [
  {
    id: "today",
    label: "Today",
    compute: () => {
      const today = new Date();
      const day = ymd(today);
      return { start: day, end: day };
    },
  },
  {
    id: "yesterday",
    label: "Yesterday",
    compute: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const day = ymd(d);
      return { start: day, end: day };
    },
  },
  {
    id: "last7",
    label: "Last 7 days",
    compute: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    id: "last28",
    label: "Last 28 days",
    compute: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 27);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    id: "last30",
    label: "Last 30 days",
    compute: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    id: "thisMonth",
    label: "This month",
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: ymd(start), end: ymd(now) };
    },
  },
  {
    id: "lastMonth",
    label: "Last month",
    compute: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: ymd(start), end: ymd(end) };
    },
  },
  {
    id: "last90",
    label: "Last 90 days",
    compute: () => {
      const end = new Date();
      const start = new Date(end.getTime() - (FREE_DATE_WINDOW_DAYS - 1) * DAY_MS);
      return { start: ymd(start), end: ymd(end) };
    },
  },
];

function clampRangeForFree(startStr, endStr) {
  if (!startStr) return { start: startStr, end: endStr, notice: "", clamped: false };
  const now = new Date();
  const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cutoff = new Date(utcToday.getTime() - (FREE_DATE_WINDOW_DAYS - 1) * DAY_MS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const cutoffMs = cutoff.getTime();

  const parseToMs = (value) => {
    if (!value) return null;
    const ms = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  };

  let nextStart = startStr;
  let nextEnd = endStr;
  let clamped = false;

  const startMs = parseToMs(startStr);
  if (startMs != null && startMs < cutoffMs) {
    nextStart = cutoffStr;
    clamped = true;
  }

  const endMs = parseToMs(endStr);
  if (clamped && (endMs == null || endMs < cutoffMs)) {
    nextEnd = cutoffStr;
  }

  const notice = clamped ? `Free plan shows the last ${FREE_DATE_WINDOW_DAYS} days. Upgrade for full history.` : "";
  return { start: nextStart, end: nextEnd, notice, clamped };
}

const COLORS = {
  googleBlue: "var(--aa-primary)",
  googleGreen: "#22C55E",
  googleRed: "#EF4444",
  frost: "var(--aa-color-bg)",
  frostEdge: "var(--aa-color-border)",
  text: "var(--aa-color-ink)",
  subtext: "var(--aa-color-muted)",
  border: "var(--aa-color-border)",
  soft: "#EEF1F7",
};
const PREMIUM_PREVIEW_COPY = {
  "Trends over time": [
    "Overlay sessions, revenue, and conversions with MoM/YoY call-outs.",
    "Surface anomalies automatically with narrative context.",
    "Download annotated charts for decks or async updates.",
  ],
  Campaigns: [
    "Rank campaigns by lift, spend efficiency, and assisted impact.",
    "Flag naming/UTM hygiene issues before they block analysis.",
    "Generate CRO-ready AI summaries per campaign theme.",
  ],
  "Campaign drill-down": [
    "Deep dive into ad format, creative, and keyword splits.",
    "Spot incompatible metrics and retry with safe fallbacks automatically.",
    "Map drop-offs to best-practice fixes (copy, offer, UX).",
  ],
  "Campaigns (KPI metrics)": [
    "Track CPA, ROAS, CVR, and revenue per session in one table.",
    "Highlight KPI deltas vs. last period with targets/badges.",
    "Export directly to CSV / Docs for board or investor updates.",
  ],
  "Landing Pages × Attribution": [
    "Blend landing page performance with source/medium for intent clarity.",
    "Flag UX issues: slow loads, weak reassurance, misleading promise.",
    "Tie each opportunity to AI playbooks + experiment backlog entries.",
  ],
  "KPI Targets & Alerts / Digest": [
    "Set KPI targets and receive Slack/email digests with deltas.",
    "Get proactive alerts when GA4 usage or AI limits are close.",
    "Attach AI PRO commentary so the team knows what to do next.",
  ],
  __default: [
    "Full-fidelity GA4 report with exports, saves, and schedules.",
    "Summarise with AI PRO: hypotheses, playbooks, experiments, best practices.",
    "Priority support plus higher GA4/AI limits for power users.",
  ],
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
  if (state.appliedFilters?.deviceType && state.appliedFilters.deviceType !== "All") {
    p.set("deviceType", state.appliedFilters.deviceType);
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
    deviceType: q.deviceType || "All",
    comparePrev: q.compare === "1",
  };
}

function formatErrorMessage(err, fallback = "Something went wrong") {
  if (!err) return fallback;
  if (err.userMessage) return err.userMessage;
  if (err.status === 429 && err.limit) {
    const kindLabel =
      err.limit.kind === "ai"
        ? err.limit.plan === "premium"
          ? "Summarise with AI PRO"
          : "Summarise with AI"
        : "GA4 reports";
    const planLabel = err.limit.plan === "premium" ? "Premium" : "Free";
    return `Monthly limit reached for ${kindLabel} on your ${planLabel} plan (${err.limit.limit} per month). Try again next month or upgrade for more headroom.`;
  }
  if (err.code === "PREMIUM_REQUIRED") {
    return `This feature is part of the Premium plan. Visit ${PREMIUM_LANDING_PATH} to upgrade.`;
  }
  if (err.code === "AUTH_REQUIRED" || err.status === 401) {
    return "Please sign in again or reconnect Google Analytics, then retry.";
  }
  if (err.status === 403) {
    return "Access denied for this request. Check your permissions or reconnect Google Analytics.";
  }
  if (err.code === "CSV_LIMIT") {
    return "CSV exports are limited to 3 per week on your current plan. Upgrade for more headroom.";
  }
  return String(err.message || fallback);
}
async function fetchJson(url, payload, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (typeof window !== "undefined") {
    try {
      if (hasLocalPremiumFlag()) {
        headers["x-aa-premium-override"] = "true";
      }
    } catch {}
  }
  const res = await fetch(url, {
    method: opts.method || "POST",
    headers,
    body: opts.method === "GET" ? undefined : JSON.stringify(payload || {}),
    credentials: "include", // Ensure cookies are sent with requests
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
    if (data?.code) err.code = data.code;
    if (data?.limit) err.limit = data.limit;
    if (data?.details) err.details = data.details;
    err.userMessage = formatErrorMessage(err, msg);
    throw err;
  }
  return data || {};
}
function useCsvGuard(setter) {
  return useCallback(
    (fn) => async () => {
      try {
        await fetchJson("/api/usage/csv-download");
        await fn();
      } catch (err) {
        setter(formatErrorMessage(err, "Unable to export right now."));
      }
    },
    [setter]
  );
}
function ymd(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
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
async function trackCsvDownloadUsage() {
  return fetchJson("/api/usage/csv-download", {});
}

async function downloadCsvChannels(rows, totals, startDate, endDate) {
  if (!rows?.length) return;
  await trackCsvDownloadUsage();
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
async function downloadCsvGeneric(filenamePrefix, rows, columns) {
  if (!rows?.length) return;
  await trackCsvDownloadUsage();
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

// === Header‑aware GA4 helpers (use across panels) ===
function getHeaderIndexes(data) {
  const dims = (data?.dimensionHeaders || []).map((h) => h.name);
  const mets = (data?.metricHeaders || []).map((h) => h.name);
  const dimIdx = (name) => dims.findIndex((n) => n === name);
  const metIdx = (name) => mets.findIndex((n) => n === name);
  return { dimIdx, metIdx, dims, mets };
}
// Safely read a metric by header name; falls back to 0 when missing
function metValByName(row, headers, name, fallbacks = []) {
  const all = [name, ...fallbacks];
  for (const n of all) {
    const i = headers.metIdx(n);
    if (i >= 0) {
      const v = Number(row?.metricValues?.[i]?.value ?? 0);
      if (!Number.isNaN(v)) return v;
    }
  }
  return 0;
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
function Pill({ color = "var(--aa-primary)", bg = "var(--aa-color-pill)", text, title }) {
  return (
    <span
      title={title || ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${COLORS.frostEdge}`,
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
        marginTop: 24,
        border: `1px solid ${COLORS.frostEdge}`,
        borderRadius: 28,
        background: "var(--aa-color-surface-muted)",
        backdropFilter: "blur(18px)",
        boxShadow: "var(--aa-shadow-card)",
      }}
    >
      <div
        style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${COLORS.frostEdge}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          background: "var(--aa-color-surface-strong)",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16, color: COLORS.text }}>{title}</h3>
        {actions ? <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </section>
  );
}
function Button({ onClick, children, disabled, kind = "default", title, id, style }) {
  const base = {
    padding: "12px 20px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    background: "var(--aa-color-surface)",
    color: COLORS.text,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontWeight: 600,
    letterSpacing: "0.01em",
    boxShadow: disabled ? "none" : "0 10px 25px rgba(15,23,42,0.08)",
    transition: "transform 120ms ease, box-shadow 200ms ease, background 200ms ease",
  };
  const kinds = {
    default: base,
    primary: {
      ...base,
      background: COLORS.googleBlue,
      borderColor: "transparent",
      color: "#fff",
      boxShadow: "var(--aa-cta-shadow)",
    },
    primaryCta: {
      ...base,
      background: COLORS.googleBlue,
      borderColor: "transparent",
      color: "#fff",
      boxShadow: "var(--aa-cta-shadow)",
    },
    subtle: {
      ...base,
      background: "var(--aa-primary-soft)",
      borderColor: "transparent",
      color: COLORS.text,
    },
    ghost: {
      ...base,
      background: "transparent",
      borderColor: COLORS.border,
      color: COLORS.text,
      boxShadow: "none",
    },
    danger: {
      ...base,
      background: "#fef2f2",
      borderColor: "#fecaca",
      color: COLORS.googleRed,
    },
  };
  const st = { ...kinds[kind] };
  return (
    <button
      type="button"
      id={id}
      title={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...st, ...(style || {}) }}
    >
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

/* ============================== Premium Gate helpers ============================== */
function hasLocalPremiumFlag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const raw = window.localStorage.getItem(PREMIUM_FLAG_KEY);
    const value = raw ? String(raw).toLowerCase() : "";
    return value === "alpha" || value === "pro" || value === "true" || value === "yes";
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
  const [datePreset, setDatePreset] = useState("custom");
  const [presetNotice, setPresetNotice] = useState("");

  // Filters
  const [countrySel, setCountrySel] = useState("All");
  const [channelSel, setChannelSel] = useState("All");
  const [deviceTypeSel, setDeviceTypeSel] = useState("All");
  const [appliedFilters, setAppliedFilters] = useState({ country: "All", channelGroup: "All", deviceType: "All" });

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

  // Connection status (session + property id)
  const [gaSessionConnected, setGaSessionConnected] = useState(false);
  const [gaStatusLoading, setGaStatusLoading] = useState(true);
  const [hasProperty, setHasProperty] = useState(false);

  // Saved views notice
  const [saveNotice, setSaveNotice] = useState("");
  // UI helpers
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Refs
  const topAnchorRef = useRef(null);
  const gaConnectTrackedRef = useRef(false);

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
      // Normalize "Both" to "All" for backward compatibility
      const deviceType = q.deviceType === "Both" ? "All" : (q.deviceType || "All");
      setDeviceTypeSel(deviceType);
      setAppliedFilters({ country: q.country || "All", channelGroup: q.channelGroup || "All", deviceType });
      setComparePrev(!!q.comparePrev);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      if (saved?.startDate) setStartDate(saved.startDate);
      if (saved?.endDate) setEndDate(saved.endDate);
      if (saved?.appliedFilters) {
        // Normalize "Both" to "All" for backward compatibility
        const deviceType = saved.appliedFilters.deviceType === "Both" ? "All" : (saved.appliedFilters.deviceType || "All");
        setAppliedFilters({
          country: saved.appliedFilters.country || "All",
          channelGroup: saved.appliedFilters.channelGroup || "All",
          deviceType,
        });
      }
      if (saved?.countrySel) setCountrySel(saved.countrySel);
      if (saved?.channelSel) setChannelSel(saved.channelSel);
      if (saved?.deviceTypeSel) {
        // Normalize "Both" to "All" for backward compatibility
        const deviceType = saved.deviceTypeSel === "Both" ? "All" : saved.deviceTypeSel;
        setDeviceTypeSel(deviceType);
      }
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
          deviceTypeSel,
        })
      );
    } catch {}
  }, [propertyId, startDate, endDate, appliedFilters, countrySel, channelSel, deviceTypeSel]);

  useEffect(() => {
    if (gaSessionConnected && !gaConnectTrackedRef.current) {
      trackEvent("ga_connect_completed", { source: "dashboard" });
      gaConnectTrackedRef.current = true;
    }
  }, [gaSessionConnected]);

  useEffect(() => {
    setHasProperty(!!(propertyId && String(propertyId).trim()));
  }, [propertyId]);

  /* ------------------------ Robust GA session status ------------------------ */
  useEffect(() => {
    let mounted = true;
    let pollId = null;
    let attempts = 0;

    const markConnected = (val) => {
      if (!mounted) return;
      setGaSessionConnected(!!val);
      setGaStatusLoading(false);
      try {
        localStorage.setItem("insightgpt_ga_session_connected", val ? "1" : "0");
      } catch {}
    };

    const checkAuth = async () => {
      try {
        setGaStatusLoading(true);
        const data = await fetchJson("/api/auth/google/status", null, { method: "GET" });
        // Current backend returns { hasTokens, expired }
        const connected = !!data?.hasTokens && !data?.expired;
        markConnected(connected);
      } catch {
        try {
          const last = localStorage.getItem("insightgpt_ga_session_connected");
          if (last === "1") markConnected(true);
          else markConnected(false);
        } catch {
          markConnected(false);
        }
      }
    };

    checkAuth();

    // Poll for first minute (6x / 10s) to catch OAuth callback updates
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

  // Back-to-top visibility
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setShowBackToTop(y > 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const connect = () => {
    trackEvent("ga_connect_started", { source: "dashboard" });
    window.location.href = "/api/auth/google/start";
  };
  const applyFilters = () => {
    setAppliedFilters({ country: countrySel, channelGroup: channelSel, deviceType: deviceTypeSel });
  };

  async function fetchGa4Channels({ propertyId, startDate, endDate, filters }) {
    // Ensure filters always has deviceType, and normalize "Both" to "All" for backward compatibility
    const deviceType = filters?.deviceType === "Both" ? "All" : (filters?.deviceType || "All");
    const safeFilters = {
      ...filters,
      deviceType,
    };
    return fetchJson("/api/ga4/query", { propertyId, startDate, endDate, filters: safeFilters });
  }

  const runReport = async () => {
    trackEvent("report_run", {
      has_ga4_connected: gaSessionConnected ? "true" : "false",
      date_range: datePreset,
      property_selected: propertyId ? "true" : "false",
      compare_previous: comparePrev ? "true" : "false",
    });
    setError("");
    setGaSessionConnected(true); // optimistic until backend says otherwise
    setResult(null);
    setPrevResult(null);
    setLoading(true);
    setPendingScroll(true);
    let startForFetch = startDate;
    let endForFetch = endDate;

    if (!premium) {
      const clamped = clampRangeForFree(startDate, endDate);
      startForFetch = clamped.start;
      endForFetch = clamped.end;
      if (clamped.clamped) {
        setStartDate(clamped.start);
        setEndDate(clamped.end);
      }
      if (clamped.notice) {
        setPresetNotice(clamped.notice);
      }
    }

    try {
      const curr = await fetchGa4Channels({
        propertyId,
        startDate: startForFetch,
        endDate: endForFetch,
        filters: appliedFilters,
      });
      // If the call works, we are definitely connected
      setGaSessionConnected(true);
      try {
        localStorage.setItem("insightgpt_ga_session_connected", "1");
      } catch {}

      setResult(curr);
      
      // Only show error for empty results if we're confident there should be data
      // Don't show error on initial load or if result is null/undefined
      if (curr && curr.ok && Array.isArray(curr.rows) && curr.rows.length === 0) {
        // Only show error if we have a property ID and valid dates (not initial state)
        if (propertyId && startForFetch && endForFetch) {
          const dateRange = `${startForFetch} to ${endForFetch}`;
          const filterInfo = [];
          if (appliedFilters.country && appliedFilters.country !== "All") filterInfo.push(`Country: ${appliedFilters.country}`);
          if (appliedFilters.channelGroup && appliedFilters.channelGroup !== "All") filterInfo.push(`Channel: ${appliedFilters.channelGroup}`);
          if (appliedFilters.deviceType && appliedFilters.deviceType !== "All") filterInfo.push(`Device: ${appliedFilters.deviceType}`);
          
          const filterText = filterInfo.length > 0 ? `\n\nApplied filters: ${filterInfo.join(", ")}` : "";
          setError(
            `No data found for ${dateRange}${filterText}\n\n` +
            `Possible causes:\n` +
            `• No data exists in GA4 for this date range\n` +
            `• Property ID may be incorrect\n` +
            `• Filters may be too restrictive\n\n` +
            `Try: Removing filters, expanding the date range, or verifying your Property ID`
          );
        }
      } else if (curr && curr.ok && curr.rows && curr.rows.length > 0) {
        // Clear error if we have data
        setError("");
      }
      setPendingScroll(true);

      // Update URL to reflect the view we just ran
      try {
        const qs = encodeQuery({
          startDate: startForFetch,
          endDate: endForFetch,
          appliedFilters,
          comparePrev,
        });
        const path = window.location.pathname + (qs ? `?${qs}` : "");
        window.history.replaceState(null, "", path);
      } catch {}

      // Broadcast reset for sections & AI
      setRefreshSignal((n) => n + 1);

      if (comparePrev) {
        const { prevStart, prevEnd } = computePreviousRange(startForFetch, endForFetch);
        const prev = await fetchGa4Channels({
          propertyId,
          startDate: prevStart,
          endDate: prevEnd,
          filters: appliedFilters,
        });
        setPrevResult(prev);
      } else {
        setPrevResult(null);
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        setGaSessionConnected(false);
        try {
          localStorage.setItem("insightgpt_ga_session_connected", "0");
        } catch {}
        setError(
          e.userMessage ||
            e.message ||
            'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then run again.'
        );
      } else {
        setError(formatErrorMessage(e));
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
    setDatePreset("custom");
    setPresetNotice("");
    setCountrySel("All");
    setChannelSel("All");
    setDeviceTypeSel("All");
    setAppliedFilters({ country: "All", channelGroup: "All", deviceType: "All" });
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

  const applyDatePreset = (presetId) => {
    const preset = DATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const { start, end } = preset.compute();
    if (!start || !end) return;

    let nextStart = start;
    let nextEnd = end;
    let notice = "";

    if (!premium) {
      const clamped = clampRangeForFree(nextStart, nextEnd);
      nextStart = clamped.start;
      nextEnd = clamped.end;
      notice = clamped.notice;
    } else {
      notice = "";
    }

    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDatePreset(presetId);
    setPresetNotice(notice);
  };

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
  const [account, setAccount] = useState({
    loading: true,
    premium: false,
    plan: null,
    signedIn: false,
    email: null,
  });
  const [qaPremiumOverride, setQaPremiumOverride] = useState(false);
  const [pendingScroll, setPendingScroll] = useState(false);

  useEffect(() => {
    setQaPremiumOverride(hasLocalPremiumFlag());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { method: "GET", credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setAccount({
          loading: false,
          premium: !!data?.premium,
          plan: data?.plan || null,
          signedIn: !!data?.signedIn,
          email: data?.email || null,
        });
      } catch {
        if (!cancelled) {
          setAccount((prev) => ({ ...prev, loading: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const premium = qaPremiumOverride || account.premium;
  const planLabel = premium
    ? qaPremiumOverride
      ? "QA override"
      : account.plan || "Premium"
    : "Free";

  useEffect(() => {
    if (premium) {
      setPresetNotice("");
    }
  }, [premium]);

  useEffect(() => {
    if (pendingScroll && !loading && topAnchorRef.current) {
      topAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScroll(false);
    }
  }, [pendingScroll, loading, rows.length]);

  const quickTabs = [
    { id: "qt-channels", label: "Channels overview", targetId: "hero-channels" },
    { id: "qt-top-pages", label: "Top pages (views)", targetId: "kpi-top-pages" },
    { id: "qt-source-medium", label: "Source / Medium", targetId: "kpi-source-medium" },
    { id: "qt-ecommerce", label: "E-commerce KPIs", targetId: "kpi-ecommerce" },
    { id: "qt-checkout", label: "Checkout funnel", targetId: "kpi-checkout" },
    { id: "qt-trends", label: "Trends over time", targetId: "section-trends" },
    { id: "qt-campaigns", label: "Campaigns", targetId: "kpi-campaigns" },
    { id: "qt-campaign-drilldown", label: "Campaign drill-down", targetId: "kpi-campaign-drilldown" },
    { id: "qt-campaign-metrics", label: "Campaigns (KPI metrics)", targetId: "kpi-campaign-metrics" },
    { id: "qt-landing", label: "Landing Pages × Attribution", targetId: "section-landing-pages" },
    { id: "qt-kpi-alerts", label: "KPI Targets & Alerts / Digest", targetId: "section-kpi-alerts" },
  ];

  const scrollToSection = (targetId) => {
    try {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch {
      // no-op
    }
  };

  const runDisabled = loading || !hasProperty; // report only blocked by property presence
  const controlFieldStyle = {
    marginTop: 6,
    padding: 12,
    width: "100%",
    borderRadius: 18,
    border: `1px solid ${COLORS.border}`,
    background: "var(--aa-color-surface)",
    boxShadow: "0 12px 26px rgba(15,23,42,0.05)",
  };
  const csvGuard = useCsvGuard(setError);

  return (
    <>
      <header className="aa-nav">
        <div className="aa-nav__inner">
          <div className="aa-nav__logo">
            <Image
              src="/header-logo.png"
              alt="AnalyticsAssistant"
              width={2415}
              height={207}
              priority
              style={{ height: 20, width: "auto" }}
            />
          </div>
          <div className="aa-nav__cta">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusDot status={sessionStatus.s} label={sessionStatus.label} />
              <StatusDot status={propertyStatus.s} label={propertyStatus.label} />
            </div>
            <Button
              onClick={connect}
              title="Connect Google Analytics"
              kind="primaryCta"
              id="cta-connect-google-nav"
            >
              Connect Google Analytics
            </Button>
          </div>
        </div>
      </header>

      <main className="aa-shell">
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
              onClick={csvGuard(() => downloadCsvChannels(rows, totals, startDate, endDate))}
              disabled={!rows.length}
              title={rows.length ? "Download channels table as CSV" : "Run a report first"}
            >
              Download CSV
            </Button>
            <label
              style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
              title="Compare vs previous period"
            >
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div>
            <label htmlFor="property-id" style={{ fontSize: 12, color: COLORS.subtext, fontWeight: 600 }}>
              GA4 Property ID
            </label>
            <input
              id="property-id"
              name="property-id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="e.g. 123456789"
              style={controlFieldStyle}
            />
          </div>

          <div>
            <label htmlFor="start-date" style={{ fontSize: 12, color: COLORS.subtext, fontWeight: 600 }}>
              Start date
            </label>
            <input
              id="start-date"
              name="start-date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
                setPresetNotice("");
              }}
              style={controlFieldStyle}
            />
          </div>

          <div>
            <label htmlFor="end-date" style={{ fontSize: 12, color: COLORS.subtext, fontWeight: 600 }}>
              End date
            </label>
            <input
              id="end-date"
              name="end-date"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
                setPresetNotice("");
              }}
              style={controlFieldStyle}
            />
          </div>

          <div>
            <label htmlFor="country-filter" style={{ fontSize: 12, color: COLORS.subtext, fontWeight: 600 }}>
              Country
            </label>
            <select
              id="country-filter"
              value={countrySel}
              onChange={(e) => setCountrySel(e.target.value)}
              style={controlFieldStyle}
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="channel-filter" style={{ fontSize: 12, color: COLORS.subtext, fontWeight: 600 }}>
              Channel Group
            </label>
            <select
              id="channel-filter"
              value={channelSel}
              onChange={(e) => setChannelSel(e.target.value)}
              style={controlFieldStyle}
            >
              {CHANNEL_GROUP_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="device-filter" style={{ fontSize: 12, color: COLORS.subtext, fontWeight: 600 }}>
              Device Type
            </label>
            <select
              id="device-filter"
              value={deviceTypeSel}
              onChange={(e) => setDeviceTypeSel(e.target.value)}
              style={controlFieldStyle}
            >
              <option value="All">All</option>
              <option value="Desktop">Desktop</option>
              <option value="Mobile">Mobile</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", alignSelf: "flex-end" }}>
            <Button 
              onClick={applyFilters} 
              title="Apply filters"
              className="aa-apply-filters-btn"
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              Apply filters
            </Button>
            {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All" || (appliedFilters.deviceType && appliedFilters.deviceType !== "All")) && (
              <Pill
                color={COLORS.googleGreen}
                bg="#E6F4EA"
                text={`Filters: ${[
                  appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : "",
                  appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : "",
                  appliedFilters.deviceType && appliedFilters.deviceType !== "All" ? `Device=${appliedFilters.deviceType}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}`}
                title="Active filters"
              />
            )}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DATE_PRESETS.map((preset) => {
              const isActive = datePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyDatePreset(preset.id)}
                  style={{
                    borderRadius: 999,
                    border: isActive ? `1px solid ${COLORS.googleBlue}` : `1px solid ${COLORS.border}`,
                    background: isActive ? "var(--aa-primary-soft)" : "var(--aa-color-surface)",
                    color: isActive ? COLORS.googleBlue : COLORS.subtext,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: isActive ? "0 12px 22px rgba(76,110,245,0.25)" : "none",
                    transition: "all 0.2s ease",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setDatePreset("custom");
                setPresetNotice("");
              }}
              style={{
                borderRadius: 999,
                border: datePreset === "custom" ? `1px solid ${COLORS.googleBlue}` : `1px solid ${COLORS.border}`,
                background: datePreset === "custom" ? "var(--aa-primary-soft)" : "var(--aa-color-surface)",
                color: datePreset === "custom" ? COLORS.googleBlue : COLORS.subtext,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: datePreset === "custom" ? "0 12px 22px rgba(76,110,245,0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              Custom
            </button>
          </div>
          {presetNotice && (
            <p style={{ marginTop: 8, fontSize: 12, color: COLORS.subtext }}>{presetNotice}</p>
          )}
        </div>
      </FrostCard>

      <div
        style={{
          marginTop: 32,
          padding: premium ? 24 : 28,
          borderRadius: premium ? 28 : 32,
          border: premium ? `1px solid ${COLORS.frostEdge}` : "1px solid rgba(79, 70, 229, 0.35)",
          background: premium
            ? "var(--aa-color-surface)"
            : "linear-gradient(135deg, rgba(238,242,255,0.95), rgba(255,255,255,0.98))",
          boxShadow: premium ? "var(--aa-shadow-card)" : "0 25px 60px rgba(79,70,229,0.16)",
        }}
      >
        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span role="img" aria-label="status sparkle">
            ✨
          </span>
          <span>Plan status</span>
          <span className="aa-badge">
            {premium ? `Premium${account.plan ? ` (${account.plan})` : ""}` : "Free"}
          </span>
        </div>
        {premium ? (
          <p style={{ margin: "10px 0 0", color: COLORS.subtext, fontSize: 14, lineHeight: 1.6 }}>
            Pro unlocks effectively unlimited GA4 reports (fair use), {PREMIUM_USAGE_LIMITS.ai.toLocaleString()} AI summaries/month,
            up to {PRO_PROPERTY_LIMIT} GA4 properties, full historical lookback + comparisons, exports, scheduled Slack/email
            digests, saved questions/templates, advanced AI deep dives, and priority support.
          </p>
        ) : (
          <>
            <p style={{ margin: "14px 0 8px", color: COLORS.subtext, fontSize: 14, lineHeight: 1.6 }}>
              Free includes {FREE_USAGE_LIMITS.ga4} GA4 reports/month, {FREE_USAGE_LIMITS.ai} AI summaries/month,{" "}
              {FREE_PROPERTY_LIMIT} GA4 property, and the last {FREE_DATE_WINDOW_DAYS} days of data. Upgrade to unlock:
            </p>
            <ul style={{ margin: "0 0 14px 18px", color: COLORS.subtext, fontSize: 14, lineHeight: 1.5 }}>
              <li>Full GA4 history with comparisons</li>
              <li>Multiple properties + saved views</li>
              <li>AI PRO summaries, exports, and digests</li>
            </ul>
            <a
              href={PREMIUM_LANDING_PATH}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 22px",
                borderRadius: 999,
                fontWeight: 600,
                color: "#fff",
                background: COLORS.googleBlue,
                boxShadow: "var(--aa-cta-shadow)",
                textDecoration: "none",
              }}
              onClick={() =>
                trackEvent("upgrade_cta_clicked", {
                  entry_point: "dashboard_plan_status",
                  plan_type: "n/a",
                  signed_in: premium ? "true" : "false",
                })
              }
            >
              Upgrade to Premium
            </a>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: COLORS.subtext }}>
              Cancel anytime via the Stripe billing portal.
            </p>
          </>
        )}
        {qaPremiumOverride && (
          <p style={{ margin: "6px 0 0", color: COLORS.subtext, fontSize: 12 }}>
            QA override is active locally via <code>{PREMIUM_FLAG_KEY}</code> in localStorage.
          </p>
        )}
      </div>

      {/* Quick KPI navigation */}
      <div
        className="aa-dashboard-quick-tabs"
        style={{
          marginTop: 16,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            minWidth: "max-content",
          }}
        >
          {quickTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => scrollToSection(tab.targetId)}
              style={{
                borderRadius: 999,
                border: `1px solid ${COLORS.border}`,
                background: "var(--aa-color-surface)",
                color: COLORS.subtext,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 10px 20px rgba(15,23,42,0.08)",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved Views (Premium) */}
      <div style={{ marginTop: 12 }}>
        <SavedViews
          premium={premium}
          startDate={startDate}
          endDate={endDate}
          countrySel={countrySel}
          channelSel={channelSel}
          deviceTypeSel={deviceTypeSel}
          comparePrev={comparePrev}
          onApply={(view) => {
            setStartDate(view.startDate);
            setEndDate(view.endDate);
            setCountrySel(view.country || "All");
            setChannelSel(view.channelGroup || "All");
            // Normalize "Both" to "All" for backward compatibility
            const viewDeviceType = view.deviceType === "Both" ? "All" : (view.deviceType || "All");
            setDeviceTypeSel(viewDeviceType);
            setComparePrev(!!view.comparePrev);
            setAppliedFilters({
              country: view.country || "All",
              channelGroup: view.channelGroup || "All",
              deviceType: view.deviceType === "Both" ? "All" : (view.deviceType || "All"),
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
                premium={premium}
              />
              <Button
                onClick={csvGuard(() => downloadCsvChannels(rows, totals, startDate, endDate))}
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

      {/* KEY KPIs: Top pages, source/medium, e‑commerce, funnel */}
      <div id="section-pages-funnel" style={{ marginTop: 12 }}>
      {/* MOBILE-ONLY ACCORDION FOR KEY KPIs */}
        <div className="mobile-accordion">
        <MobileAccordionSection title="Top pages (views)">
          <TopPages
            key={`tp-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
            premium={premium}
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
            premium={premium}
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
            premium={premium}
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
            premium={premium}
          />
        </MobileAccordionSection>
      </div>

      {/* DESKTOP/VISIBLE SECTIONS (non-accordion) */}
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <HideOnMobile>
            <div id="kpi-top-pages" />
          <TopPages
            key={`tp2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
            premium={premium}
          />
            <div id="kpi-source-medium" />
          <SourceMedium
            key={`sm2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
            premium={premium}
          />
            <div id="kpi-ecommerce" />
          <EcommerceKPIs
            key={`ekpi2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
            premium={premium}
          />
            <div id="kpi-checkout" />
          <CheckoutFunnel
            key={`cf2-${dashKey}`}
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
            premium={premium}
          />
        </HideOnMobile>
        </div>
      </div>

      {/* PREMIUM SECTIONS */}
      <div id="section-trends">
      <PremiumGate label="Trends over time" premium={premium}>
        <TrendsOverTime
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          premium={premium}
        />
      </PremiumGate>
      </div>

      <div id="section-campaigns">
        <div id="kpi-campaigns">
      <PremiumGate label="Campaigns" premium={premium}>
        <Campaigns
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          premium={premium}
        />
      </PremiumGate>
        </div>

        <div id="kpi-campaign-drilldown">
      <PremiumGate label="Campaign drill-down" premium={premium}>
        <CampaignDrilldown
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          premium={premium}
        />
      </PremiumGate>
        </div>

        <div id="kpi-campaign-metrics">
      <PremiumGate label="Campaigns (KPI metrics)" premium={premium}>
        <CampaignsOverview
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          premium={premium}
        />
      </PremiumGate>
        </div>
      </div>

      <div id="section-landing-pages">
      <PremiumGate label="Landing Pages × Attribution" premium={premium}>
        <LandingPages
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          premium={premium}
        />
      </PremiumGate>
      </div>

      {process.env.NEXT_PUBLIC_ENABLE_PRODUCTS === "true" && (
        <Products
          propertyId={propertyId}
          startDate={startDate}
          endDate={endDate}
          filters={appliedFilters}
          resetSignal={refreshSignal}
          premium={premium}
        />
      )}

      {/* KPI Targets & Alerts / Digest (Premium) */}
      <div id="section-kpi-alerts">
      <PremiumGate label="KPI Targets & Alerts / Digest" premium={premium}>
        <KpiAndAlerts />
      </PremiumGate>
      </div>

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

      {showBackToTop && (
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          className="aa-back-to-top"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 50,
            borderRadius: 999,
            border: "none",
            padding: "10px 12px",
            background: "var(--aa-color-surface)",
            boxShadow: "0 10px 25px rgba(15,23,42,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          aria-label="Back to top"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>↑</span>
        </button>
      )}

      <ChatWidget
        propertyId={propertyId}
        startDate={startDate}
        endDate={endDate}
        filters={appliedFilters}
      />

      </main>
    </>
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
function AiBlock({
  asButton = false,
  buttonLabel = "Summarise with AI",
  endpoint,
  payload,
  resetSignal,
  blueCta = false,
  premium = false,
}) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [qualNotes, setQualNotes] = useState("");

  useEffect(() => {
    setText("");
    setError("");
    setCopied(false);
    setQualNotes("");
  }, [resetSignal]);

  const run = async () => {
    setLoading(true);
    setError("");
    setText("");
    setCopied(false);
    trackEvent("ai_summary_requested", {
      endpoint,
      premium: premium ? "true" : "false",
    });
    try {
      const requestPayload = payload ? { ...payload } : {};
      if (premium && qualNotes.trim()) {
        requestPayload.qualitativeNotes = qualNotes.trim();
      }
      const data = await fetchJson(endpoint, requestPayload);
      const summary = data?.summary || (typeof data === "string" ? data : "");
      setText(summary || "No response");
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to generate a summary right now."));
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

  const baseLabel = buttonLabel || "Summarise with AI";
  const resolvedLabel = premium
    ? baseLabel.includes("Summarise with AI")
      ? baseLabel.replace("Summarise with AI", "Summarise with AI PRO")
      : `${baseLabel} PRO`
    : baseLabel;

  const runBtn = blueCta ? (
    <BlueAiButton onClick={run} disabled={loading} title="AI summary">
      {loading ? "Summarising…" : resolvedLabel}
    </BlueAiButton>
  ) : (
    <Button onClick={run} disabled={loading} title="AI summary">
      {loading ? "Summarising…" : resolvedLabel}
    </Button>
  );

  const trigger = asButton ? (
    runBtn
  ) : (
    <BlueAiButton onClick={run} disabled={loading} title="AI summary">
      {loading ? "Summarising…" : resolvedLabel}
    </BlueAiButton>
  );

  const placeholder = premium
    ? "Summarise with AI PRO surfaces hypotheses, best practices, and experiment-ready playbooks once you run it."
    : "Summarise with AI turns this table into a plain-English digest once you run it.";
  const labelText = premium ? "AI PRO insight" : "AI insight";
  const statusText = text ? "Latest run" : "Insight will appear here";

  return (
    <div className="aa-ai-block" data-premium={premium ? "true" : "false"}>
      <div className="aa-ai-block__controls">{trigger}</div>
      {error && <p className="aa-ai-block__error">Error: {error}</p>}
      <article className={`aa-ai-block__output${text ? " aa-ai-block__output--ready" : ""}`}>
        <div className="aa-ai-block__output-head">
          <div className="aa-ai-block__label">
            <span className="aa-ai-block__badge">{labelText}</span>
            <span className="aa-ai-block__meta-text">{statusText}</span>
          </div>
          <Button onClick={copy} disabled={!text} kind="ghost" title="Copy AI insight">
            {copied ? "Copied!" : "Copy insight"}
          </Button>
        </div>
        <div className={`aa-ai-block__body${text ? " is-filled" : " is-empty"}`}>{text || placeholder}</div>
      </article>
      {premium && (
        <div className="aa-ai-block__notes">
          <label className="aa-ai-block__notes-label">
            Qualitative notes (optional) — paste survey quotes, onsite feedback, or support tickets
          </label>
          <textarea
            value={qualNotes}
            onChange={(e) => setQualNotes(e.target.value)}
            placeholder='Example: "Checkout shipping step is confusing" or "Chat feedback about pricing surprise".'
            rows={3}
            className="aa-ai-block__textarea"
          />
          <small className="aa-ai-block__hint">
            We weave these notes into the Summarise with AI PRO hypotheses and playbooks.
          </small>
        </div>
      )}
    </div>
  );
}

/* ============================== Sections ============================== */
function SourceMedium({ propertyId, startDate, endDate, filters, resetSignal, premium }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const csvGuard = useCsvGuard(setError);

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

      // Use raw data for headers (contains dimensionHeaders and metricHeaders)
      const raw = data.raw || data;
      const H = getHeaderIndexes(raw);
      const rows = data.rows || raw.rows || [];
      // Accept common header names
      const iSource = ["source", "sessionSource"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const iMedium = ["medium", "sessionMedium"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const out = rows.map((r) => ({
        source: iSource >= 0 ? (r.dimensionValues?.[iSource]?.value || "(unknown)") : "(unknown)",
        medium: iMedium >= 0 ? (r.dimensionValues?.[iMedium]?.value || "(unknown)") : "(unknown)",
        sessions: metValByName(r, H, "sessions"),
        users: metValByName(r, H, "totalUsers", ["users"]),
      }));

      setRows(out);
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load source / medium."));
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
          {/* Per-panel load: fetch GA4 data for this section */}
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
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
            )}
            disabled={!rows.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>}
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

function Campaigns({ propertyId, startDate, endDate, filters, premium }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const csvGuard = useCsvGuard(setError);

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

      // Use raw data for headers (contains dimensionHeaders and metricHeaders)
      const raw = data.raw || data;
      const H = getHeaderIndexes(raw);
      const rows = data.rows || raw.rows || [];
      const iCampaign = ["campaign", "sessionCampaignName", "sessionCampaign"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const out = rows.map((r, i) => ({
        campaign: iCampaign >= 0 ? (r.dimensionValues?.[iCampaign]?.value || "(not set)") : `(row ${i + 1})`,
        sessions: metValByName(r, H, "sessions"),
        users: metValByName(r, H, "totalUsers", ["users"]),
      }));

      setRows(out);
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load campaigns."));
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
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
              downloadCsvGeneric(
                `campaigns_${startDate}_to_${endDate}`,
                rows,
                [
                  { header: "Campaign", key: "campaign" },
                  { header: "Sessions", key: "sessions" },
                  { header: "Users", key: "users" },
                ]
              )
            )}
            disabled={!rows.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>}
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

function CampaignDrilldown({ propertyId, startDate, endDate, filters, premium }) {
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [totals, setTotals] = useState(null);
  const [srcMed, setSrcMed] = useState([]);
  const [content, setContent] = useState([]);
  const [term, setTerm] = useState([]);

  const load = async () => {
    if (!campaign || !campaign.trim()) {
      setError("Please enter a campaign name first");
      return;
    }
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
        campaignName: campaign.trim(), // API expects campaignName, not campaign
        limit: 25,
      });

      // Totals
      if (data?.totals) {
        const totalsRaw = data.totals.raw || data.totals;
        const HT = getHeaderIndexes(totalsRaw);
        const row0 = (data.totals.rows || totalsRaw.rows || [])?.[0];
        const totalsParsed = row0
          ? {
              sessions: metValByName(row0, HT, "sessions"),
              users: metValByName(row0, HT, "totalUsers", ["users"]),
              transactions: metValByName(row0, HT, "transactions"),
              revenue: metValByName(row0, HT, "purchaseRevenue", ["revenue", "totalRevenue"]),
            }
          : null;
        setTotals(totalsParsed);
      }

      // Utility to parse 2‑dimensional breakdowns with four metrics
      const parse2D = (block, d1Candidates, d2Candidates) => {
        if (!block) return [];
        const blockRaw = block.raw || block;
        const H = getHeaderIndexes(blockRaw);
        const blockRows = block.rows || blockRaw.rows || [];
        const iD1 = d1Candidates.map(H.dimIdx).find((i) => i >= 0) ?? -1;
        const iD2 = d2Candidates.map(H.dimIdx).find((i) => i >= 0) ?? -1;
        return blockRows.map((r, i) => ({
          d1: iD1 >= 0 ? (r.dimensionValues?.[iD1]?.value || "") : "",
          d2: iD2 >= 0 ? (r.dimensionValues?.[iD2]?.value || "") : "",
          sessions: metValByName(r, H, "sessions"),
          users: metValByName(r, H, "totalUsers", ["users"]),
          transactions: metValByName(r, H, "transactions"),
          revenue: metValByName(r, H, "purchaseRevenue", ["revenue", "totalRevenue"]),
          key: `r-${i}`,
        }));
      };

      // Source/Medium (2D breakdown) - moved to end after fixing data structure
      if (data?.byAdContent) {
        const adContentRaw = data.raw?.byAdContent || data.byAdContent;
        const Hc = getHeaderIndexes(adContentRaw);
        const adContentRows = data.byAdContent || adContentRaw?.rows || [];
        // Check for adFormat first (what API uses), then fallback to adContent variants
        const iContent = ["adFormat", "adContent", "sessionAdContent", "creativeName"].map(Hc.dimIdx).find((i) => i >= 0) ?? -1;
        setContent(
          adContentRows.map((r, i) => ({
            content: iContent >= 0 ? (r.dimensionValues?.[iContent]?.value || "(not set)") : `(row ${i + 1})`,
            sessions: metValByName(r, Hc, "sessions"),
            users: metValByName(r, Hc, "totalUsers", ["users"]),
            transactions: metValByName(r, Hc, "transactions"),
            revenue: metValByName(r, Hc, "purchaseRevenue", ["revenue", "totalRevenue"]),
            key: `c-${i}`,
          }))
        );
      }

      // Term is 1‑dimension
      if (data?.byKeyword) {
        const termRaw = data.raw?.byKeyword || data.byKeyword;
        const Ht = getHeaderIndexes(termRaw);
        const termRows = data.byKeyword || termRaw?.rows || [];
        const iTerm = ["term", "keyword", "manualTerm"].map(Ht.dimIdx).find((i) => i >= 0) ?? -1;
        setTerm(
          termRows.map((r, i) => ({
            term: iTerm >= 0 ? (r.dimensionValues?.[iTerm]?.value || "(not set)") : `(row ${i + 1})`,
            sessions: metValByName(r, Ht, "sessions"),
            users: metValByName(r, Ht, "totalUsers", ["users"]),
            transactions: metValByName(r, Ht, "transactions"),
            revenue: metValByName(r, Ht, "purchaseRevenue", ["revenue", "totalRevenue"]),
            key: `t-${i}`,
          }))
        );
      }
      
      // Source/Medium (2D breakdown)
      setSrcMed(
        parse2D(
          data?.bySourceMedium ? { rows: data.bySourceMedium, raw: data.raw?.bySourceMedium } : null,
          ["source", "sessionSource"],
          ["medium", "sessionMedium"]
        )
      );
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load campaign drill-down."));
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
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Enter campaign name (e.g., 'summer_sale' or 'Summer Sale 2024')"
              style={{
                padding: 8,
                minWidth: 260,
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
              }}
            />
            <small style={{ color: COLORS.subtext, fontSize: 11, marginTop: -2 }}>
              💡 Tip: Use the exact campaign name from the "Campaigns" section above. Case-insensitive matching.
            </small>
          </div>
          <Button
            onClick={load}
            disabled={loading || !propertyId || !campaign}
            kind="subtle"
            title={
              !propertyId
                ? "Enter a GA4 property ID first"
                : !campaign
                  ? "Enter a campaign name first"
                  : "Load data for this section"
            }
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
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
        <div style={{ marginTop: 8, color: COLORS.subtext }}>
          <p style={{ margin: 0, marginBottom: 8 }}>
            Enter a campaign name and click &ldquo;Load data&rdquo;.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.subtext }}>
            <strong>How to find campaign names:</strong> Load the &ldquo;Campaigns&rdquo; section above to see all available campaign names. Copy the exact name (e.g., &ldquo;summer_sale&rdquo; or &ldquo;Summer Sale 2024&rdquo;) and paste it here.
          </p>
        </div>
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

function CampaignsOverview({ propertyId, startDate, endDate, filters, premium }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const csvGuard = useCsvGuard(setError);

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

      // Use raw data for headers (contains dimensionHeaders and metricHeaders)
      const raw = data.raw || data;
      const H = getHeaderIndexes(raw);
      const rows = data.rows || raw.rows || [];
      const iCampaign = ["campaign", "sessionCampaignName", "sessionCampaign"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const parsed = rows.map((r, i) => {
        const name = iCampaign >= 0 ? (r.dimensionValues?.[iCampaign]?.value ?? "(not set)") : `(row ${i + 1})`;
        const sessions = metValByName(r, H, "sessions");
        const users = metValByName(r, H, "totalUsers", ["users"]);
        const transactions = metValByName(r, H, "transactions");
        const revenue = metValByName(r, H, "purchaseRevenue", ["revenue", "totalRevenue"]);
        const cvr = sessions > 0 ? (transactions / sessions) * 100 : 0;
        const aov = transactions > 0 ? revenue / transactions : 0;
        return { key: `c-${i}`, name, sessions, users, transactions, revenue, cvr, aov };
      });
      parsed.sort((a, b) => b.revenue - a.revenue);
      setRows(parsed);
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load campaigns."));
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
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
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
            )}
            disabled={!visible.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !visible.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>}
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

function TopPages({ propertyId, startDate, endDate, filters, resetSignal, premium }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const csvGuard = useCsvGuard(setError);

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

      // Use raw data for headers (contains dimensionHeaders and metricHeaders)
      const raw = data.raw || data;
      const H = getHeaderIndexes(raw);
      const rows = data.rows || raw.rows || [];
      const iTitle = ["pageTitle"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const iPath = ["pagePath", "pagePathPlusQueryString", "landingPage", "landingPagePlusQueryString"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const out = rows.map((r, i) => ({
        title: iTitle >= 0 ? (r.dimensionValues?.[iTitle]?.value || "(untitled)") : `(row ${i + 1})`,
        path: iPath >= 0 ? (r.dimensionValues?.[iPath]?.value || "") : "",
        views: metValByName(r, H, "screenPageViews", ["views", "pageViews", "sessions"]),
        users: metValByName(r, H, "totalUsers", ["users"]),
      }));

      setRows(out);
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load top pages."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FrostCard
      title="Top pages (views)"
      actions={
        <>
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
          </Button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-pages"
            payload={{ rows, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
            blueCta
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
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
            )}
            disabled={!rows.length}
          >
            Download CSV
          </Button>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}
      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>}
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

function LandingPages({ propertyId, startDate, endDate, filters, premium }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [topOnly, setTopOnly] = useState(false);
  const [minSessions, setMinSessions] = useState(0);
  const csvGuard = useCsvGuard(setError);

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

      // Use raw data for headers (contains dimensionHeaders and metricHeaders)
      const raw = data.raw || data;
      const H = getHeaderIndexes(raw);
      const rows = data.rows || raw.rows || [];
      const iLanding = [
        "landingPage",
        "landingPagePlusQueryString",
        "pagePath",
        "pagePathPlusQueryString",
      ]
        .map(H.dimIdx)
        .find((i) => i >= 0) ?? -1;
      const iSource = ["source", "sessionSource"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      const iMedium = ["medium", "sessionMedium"].map(H.dimIdx).find((i) => i >= 0) ?? -1;

      const parsed = rows.map((r, i) => ({
        landing: iLanding >= 0 ? (r.dimensionValues?.[iLanding]?.value || "(unknown)") : `(row ${i + 1})`,
        source: iSource >= 0 ? (r.dimensionValues?.[iSource]?.value || "(unknown)") : "(unknown)",
        medium: iMedium >= 0 ? (r.dimensionValues?.[iMedium]?.value || "(unknown)") : "(unknown)",
        sessions: metValByName(r, H, "sessions"),
        users: metValByName(r, H, "totalUsers", ["users"]),
        transactions: metValByName(r, H, "transactions"),
        revenue: metValByName(r, H, "purchaseRevenue", ["revenue", "totalRevenue"]),
        _k: `${i}-${Math.random().toString(36).slice(2, 8)}`,
      }));
      setRows(parsed);
      setTopOnly(false);
      setMinSessions(0);
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load landing pages."));
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
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
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
            )}
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
          No rows loaded yet. Click Load data above.
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

function EcommerceKPIs({ propertyId, startDate, endDate, filters, resetSignal, premium }) {
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
      setError(formatErrorMessage(e, "Unable to load e-commerce KPIs."));
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
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
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

function CheckoutFunnel({ propertyId, startDate, endDate, filters, resetSignal, premium }) {
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
      setError(formatErrorMessage(e, "Unable to load checkout funnel."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <FrostCard
      title="Checkout funnel (event counts)"
      actions={
        <>
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
          </Button>
          <AiBlock
            asButton
            buttonLabel="Summarise with AI"
            endpoint="/api/insights/summarise-funnel"
            payload={{ steps, dateRange: { start: startDate, end: endDate }, filters }}
            resetSignal={resetSignal}
            blueCta
            premium={premium}
          />
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {!loading && !steps && !error && <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>}

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

function TrendsOverTime({ propertyId, startDate, endDate, filters, premium }) {
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState("daily");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const csvGuard = useCsvGuard(setError);

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
  function formatYYYYMMDD(s) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s) || "");
    if (!m) return String(s || "");
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    // Simplified format: "Sep 1, 2024" instead of "01 Sep 2024"
    return `${MONTHS[mo - 1]} ${d}, ${y}`;
  }
  function formatYearWeekRange(s) {
    const m = /^(\d{4})W?(\d{2})$/.exec(String(s) || "");
    if (!m) return String(s || "");
    const year = Number(m[1]); const week = Number(m[2]);
    const start = isoWeekStartUTC(year, week);
    // Simplified format: "Week of Sep 1" instead of "01 Sep–07 Sep 2024"
    return `Week of ${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}, ${start.getUTCFullYear()}`;
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
      
      // Parse timeseries data - API returns rows, we need to convert to series format
      const raw = data.raw || data;
      const H = getHeaderIndexes(raw);
      const rows = data.rows || raw.rows || [];
      
      // Find date dimension index
      const iDate = ["date"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
      
      // Convert rows to series format
      const series = rows.map((r) => {
        const dateValue = iDate >= 0 ? (r.dimensionValues?.[iDate]?.value || "") : "";
        return {
          period: dateValue,
          sessions: metValByName(r, H, "sessions"),
          users: metValByName(r, H, "totalUsers", ["users"]),
          transactions: metValByName(r, H, "transactions"),
          revenue: metValByName(r, H, "purchaseRevenue", ["revenue", "totalRevenue"]),
        };
      });
      
      setRows(series);
    } catch (e) {
      setError(formatErrorMessage(e, "Unable to load the time series."));
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
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
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
            )}
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
        <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>
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

function Products({ propertyId, startDate, endDate, filters, resetSignal, premium }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);
  const csvGuard = useCsvGuard(setError);

  useEffect(() => {
    setRows([]);
    setError("");
    setDebug(null);
  }, [resetSignal]);

  function parseProductsResponse(data) {
    if (!data || !Array.isArray(data.rows)) return [];
    const H = getHeaderIndexes(data);

    const iItemName = ["itemName", "item_name"].map(H.dimIdx).find((i) => i >= 0) ?? -1;
    const iItemId = ["itemId", "item_id"].map(H.dimIdx).find((i) => i >= 0) ?? -1;

    return (data.rows || []).map((r, idx) => {
      const name =
        iItemName >= 0
          ? r.dimensionValues?.[iItemName]?.value || "(unknown)"
          : iItemId >= 0
          ? r.dimensionValues?.[iItemId]?.value || "(unknown)"
          : `(row ${idx + 1})`;

      const views = metValByName(r, H, "itemViews", ["itemsViewed", "screenPageViews", "views"]);
      const carts = metValByName(r, H, "addToCarts", ["cartAdds"]);
      const purchases = metValByName(r, H, "itemPurchaseQuantity", ["itemsPurchased"]);
      const revenue = metValByName(r, H, "itemRevenue", ["purchaseRevenue", "revenue"]);

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
      const H = getHeaderIndexes(data);
      setDebug({
        which,
        headers: {
          dimensions: H.dims,
          metrics: H.mets,
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
      setError(formatErrorMessage(e, "Failed to load products"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FrostCard
      title="Product Performance"
      actions={
        <>
          <Button
            onClick={load}
            disabled={loading || !propertyId}
            kind="subtle"
            title={!propertyId ? "Enter a GA4 property ID first" : "Load data for this section"}
          >
            {loading ? "Loading…" : "Load data"}
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
            premium={premium}
          />
          <Button
            onClick={csvGuard(() =>
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
            )}
            disabled={!rows.length}
          >
            Download CSV
          </Button>
          <span style={{ color: COLORS.subtext, fontSize: 12 }}>Respects global filters (Country / Channel Group).</span>
        </>
      }
    >
      {error && <p style={{ color: COLORS.googleRed, whiteSpace: "pre-wrap" }}>Error: {error}</p>}

      {!error && !rows.length && !loading && <p style={{ color: COLORS.subtext }}>No rows loaded yet. Click Load data above.</p>}

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
function SavedViews({ premium, startDate, endDate, countrySel, channelSel, deviceTypeSel, comparePrev, onApply, onRunReport, onNotice }) {
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
        deviceType: deviceTypeSel,
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
      deviceType: p.deviceType === "Both" ? "All" : (p.deviceType || "All"),
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
                  {p.startDate} → {p.endDate} · {p.country} · {p.channelGroup} {p.deviceType && p.deviceType !== "All" ? ` · ${p.deviceType}` : ""} {p.comparePrev ? "· compare" : ""}
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
        actions={<Pill color="#92400e" bg="#FEF3C7" text="Premium required" />}
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
function PremiumTeaserMock() {
  return (
    <div className="premium-preview__mock" aria-hidden="true">
      <div className="premium-preview__mock-card">
        <div className="premium-preview__mock-chip">AI PRO insight</div>
        <div className="premium-preview__mock-title" />
        <div className="premium-preview__mock-subtitle" />
        <div className="premium-preview__mock-grid">
          <div className="premium-preview__mock-cell" />
          <div className="premium-preview__mock-cell" />
          <div className="premium-preview__mock-cell" />
        </div>
      </div>
    </div>
  );
}

/* ============================== Premium Gate Wrapper ============================== */
function PremiumGate({ label, premium, children }) {
  if (premium) return children;
  const copy = PREMIUM_PREVIEW_COPY[label] || PREMIUM_PREVIEW_COPY.__default;
  return (
    <FrostCard title={`${label} (Premium)`} actions={<Pill text="Premium required" color="#92400e" bg="#FEF3C7" />}>
      <p style={{ margin: 0, color: COLORS.subtext }}>
        Premium unlocks this panel with higher GA4/AI limits, exports, saved questions, and AI PRO deep dives tailored to your data.
      </p>
      <div className="premium-preview">
        <div className="premium-preview__label">Preview</div>
        <div className="premium-preview__body premium-preview__body--locked">
          <PremiumTeaserMock />
          <ul className="premium-preview__list">
            {copy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="premium-preview__cta">
            <p style={{ margin: 0, color: COLORS.subtext }}>
              This block is live for Premium users — unlock it to run the full workflow.
            </p>
            <Button onClick={() => (window.location.href = PREMIUM_LANDING_PATH)} kind="primaryCta">
              Upgrade to unlock
            </Button>
          </div>
        </div>
      </div>
    </FrostCard>
  );
}

/* ============================== END ============================== */
