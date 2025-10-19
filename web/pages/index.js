/* eslint-disable react/no-unescaped-entities */

// /pages/index.js
import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";

/* =============================================================================
   BRAND / THEME
   ============================================================================= */
const COLORS = {
  brand: "#4285F4",      // Google Blue (primary CTAs)
  success: "#34A853",    // up trends
  danger: "#EA4335",     // errors / down trends
  warning: "#FBBC05",    // warning accent
  text: "#0B0F17",
  subtext: "#5B6472",
  surface: "#FFFFFF",
  frosted: "rgba(255,255,255,0.7)",
  border: "#E8ECF1",
  chip: "#EEF3FF",
};

const styles = {
  page: {
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: COLORS.text,
    background:
      "radial-gradient(1200px 800px at 90% -20%, rgba(66,133,244,.08), transparent 65%), radial-gradient(1000px 600px at -10% 10%, rgba(66,133,244,.06), transparent 55%)",
  },
  wrap: { maxWidth: 1180, margin: "0 auto" },
  h1: { margin: "8px 0 0", fontSize: 24, lineHeight: 1.2 },
  sub: { margin: "4px 0 0", color: COLORS.subtext, fontSize: 14 },

  // Sticky nav
  sticky: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    background: COLORS.frosted,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  stickyInner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    maxWidth: 1180,
    margin: "0 auto",
  },

  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    boxShadow:
      "0 0.6px 1.5px rgba(0,0,0,0.03), 0 2.2px 5.2px rgba(0,0,0,0.03), 0 10px 24px rgba(0,0,0,0.04)",
  },
  sectionTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  btn: {
    padding: "8px 12px",
    cursor: "pointer",
    background: COLORS.brand,
    color: "white",
    border: 0,
    borderRadius: 10,
  },
  ghost: {
    padding: "8px 12px",
    cursor: "pointer",
    background: "transparent",
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    borderRadius: 10,
  },
  linkBtn: {
    padding: 0,
    background: "transparent",
    color: COLORS.brand,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
  },
  badgeOk: {
    background: "#E6F4EA",
    color: "#137333",
    border: "1px solid #B7E1CD",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
  },
  badgeWarn: {
    background: "#FDECEA",
    color: "#B00020",
    border: "1px solid #F4C7C3",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
  },
  premiumBadge: {
    display: "inline-block",
    background: COLORS.chip,
    color: COLORS.brand,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${COLORS.border}`,
    fontSize: 12,
    fontWeight: 700,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: COLORS.chip,
    color: COLORS.brand,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  label: { fontSize: 12, color: COLORS.subtext },
};

/* =============================================================================
   HELPERS (Stable)
   ============================================================================= */

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

/** -------- KPI Targets helpers & badge -------- */
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
      title={`${label} target: ${val} \u2022 Progress: ${pct}%`}
      style={ok ? styles.badgeOk : styles.badgeWarn}
    >
      {`${pct}% to ${label} target`}
    </span>
  );
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

/** CSV helpers */
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

/** Premium detection (server-controlled or env); no localStorage bypass */
function isPremium() {
  if (typeof window === "undefined") return false;
  return Boolean(
    // server may inject this for paid users
    window.__INSIGHT_PREMIUM ||
      // or set NEXT_PUBLIC_PREMIUM="true" for dev/staging only
      process.env.NEXT_PUBLIC_PREMIUM === "true"
  );
}

/** Premium gate wrapper (non-destructive) */
function PremiumGate({ enabled, label, children }) {
  if (enabled) return <>{children}</>;
  const allowAlpha = process.env.NEXT_PUBLIC_ALLOW_ALPHA === "true";
  return (
    <section style={{ ...styles.card, position: "relative" }}>
      <div style={{ filter: "grayscale(0.1)", opacity: 0.55, pointerEvents: "none" }}>{children}</div>
      <div
        aria-label={`${label} premium gating`}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(255,255,255,0.94))",
          borderRadius: 14,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={styles.premiumBadge}>Premium required</div>
          <div style={{ marginTop: 6, color: COLORS.subtext }}>
            Unlock <b>{label}</b> to boost your workflow.
          </div>
          {allowAlpha ? (
            <div style={{ marginTop: 10 }}>
              <span
                style={{ ...styles.btn, padding: "8px 14px", background: COLORS.warning, color: "#1d1d1f" }}
                onClick={() => {
                  // NOTE: This does not unlock premium (no localStorage bypass).
                  alert("Alpha preview is disabled for production. Ask an admin to enable Premium on your account.");
                }}
              >
                Try (alpha)
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* =============================================================================
   PAGE
   ============================================================================= */
export default function Home() {
  const premium = isPremium();

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

  // --- Channels parse
  const { rows: chRows, totals: chTotals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(
    () => parseGa4Channels(prevResult),
    [prevResult]
  );

  const top = chRows[0];
  const topShare =
    top && chTotals.sessions > 0 ? Math.round((top.sessions / chTotals.sessions) * 100) : 0;

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

  // GA4 channel fetch (uses filters)
  const fetchGa4Channels = useCallback(async ({ propertyId: pid, startDate: sd, endDate: ed, filters }) => {
    return fetchJson("/api/ga4/query", { propertyId: pid, startDate: sd, endDate: ed, filters });
  }, []);

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

  return (
    <main style={styles.page}>
      {/* Sticky header (slimmer on mobile) */}
      <div style={styles.sticky}>
        <div style={styles.stickyInner}>
          <div aria-label="brand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: COLORS.brand,
                display: "grid",
                placeItems: "center",
                color: "white",
                fontWeight: 900,
              }}
            >
              IG
            </div>
            <div style={{ fontWeight: 800 }}>InsightGPT</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={styles.pill} title="Premium status">
              {premium ? "Premium" : "Standard"}
            </span>
            <button onClick={resetDashboard} style={styles.ghost} aria-label="Reset dashboard">
              Reset
            </button>
          </div>
        </div>
      </div>

      <div style={styles.wrap}>
        <h1 style={styles.h1}>Analytics & Insights Dashboard</h1>
        <p style={styles.sub}>
          Connect GA4, choose a date range, optionally apply filters, and view traffic & insights.
        </p>

        {/* Controls */}
        <div style={{ ...styles.card }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={connect} style={styles.ghost} aria-label="Connect Google Analytics">
              Connect Google Analytics
            </button>

            <label aria-label="GA4 Property ID">
              <span style={styles.label}>GA4 Property ID&nbsp;</span>
              <input
                id="property-id"
                name="property-id"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                placeholder="e.g. 123456789"
                style={{ padding: 8, minWidth: 180 }}
              />
            </label>

            <label aria-label="Start date">
              <span style={styles.label}>Start date&nbsp;</span>
              <input
                id="start-date"
                name="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ padding: 8 }}
              />
            </label>
            <label aria-label="End date">
              <span style={styles.label}>End date&nbsp;</span>
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
              style={styles.btn}
              disabled={loading || !propertyId}
              aria-label="Run GA4 Report"
              title={!propertyId ? "Enter a GA4 property ID first" : "Run GA4 Report"}
            >
              {loading ? "Running…" : "Run GA4 Report"}
            </button>

            <label
              htmlFor="compare-prev"
              style={{ display: "inline-flex", gap: 8, alignItems: "center", paddingLeft: 8 }}
              aria-label="Compare vs previous period"
            >
              <input
                id="compare-prev"
                type="checkbox"
                checked={comparePrev}
                onChange={(e) => setComparePrev(e.target.checked)}
              />
              <span>Compare vs previous period</span>
            </label>
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...styles.card }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <b>Filters:</b>
            <label>
              <span style={styles.label}>Country&nbsp;</span>
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
              <span style={styles.label}>Channel Group&nbsp;</span>
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
            <button onClick={applyFilters} style={styles.ghost}>
              Apply filters
            </button>
            {(appliedFilters.country !== "All" || appliedFilters.channelGroup !== "All") && (
              <span style={styles.pill}>
                {`Filters: `}
                {appliedFilters.country !== "All" ? `Country=${appliedFilters.country}` : ""}
                {appliedFilters.country !== "All" && appliedFilters.channelGroup !== "All" ? " · " : ""}
                {appliedFilters.channelGroup !== "All" ? `Channel=${appliedFilters.channelGroup}` : ""}
              </span>
            )}
            <span style={{ color: COLORS.subtext, fontSize: 12 }}>
              Filters apply when you run a section (e.g. GA4 Report / Load buttons).
            </span>
          </div>
        </div>

        {error && (
          <p style={{ color: COLORS.danger, marginTop: 10 }} role="alert">
            Error: {error}
          </p>
        )}

        {/* ==================== CHANNELS AT TOP (if data) ==================== */}
        {chRows.length > 0 && (
          <ChannelsHero
            rows={chRows}
            totals={chTotals}
            prevRows={prevRows}
            prevTotals={prevTotals}
            startDate={startDate}
            endDate={endDate}
            appliedFilters={appliedFilters}
            refreshSignal={refreshSignal}
          />
        )}

        {/* ==================== SAVED VIEWS (Premium) ==================== */}
        <PremiumGate enabled={premium} label="Saved Views">
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
        </PremiumGate>

        {/* ==================== KPI TARGETS & ALERTS / DIGEST (Premium) ==================== */}
        <PremiumGate enabled={premium} label="KPI Targets & Alerts / Digest">
          <TargetsAlertsDigest
            chTotals={chTotals}
            startDate={startDate}
            endDate={endDate}
            appliedFilters={appliedFilters}
            refreshSignal={refreshSignal}
          />
        </PremiumGate>

        {/* ==================== ORDERED SECTIONS ==================== */}

        {/* 1. Top pages (views) */}
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

        {/* Products (feature flag) – keep where it was (optional in order) */}
        {process.env.NEXT_PUBLIC_ENABLE_PRODUCTS === "true" && (
          <Products
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
            resetSignal={refreshSignal}
          />
        )}

        {/* 6. Trends over time (Premium) */}
        <PremiumGate enabled={premium} label="Trends over time">
          <TrendsOverTime
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
          />
        </PremiumGate>

        {/* 7. Campaigns (Premium) */}
        <PremiumGate enabled={premium} label="Campaigns">
          <Campaigns
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
          />
        </PremiumGate>

        {/* 8. Campaign drill-down (Premium) */}
        <PremiumGate enabled={premium} label="Campaign drill-down">
          <CampaignDrilldown
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
          />
        </PremiumGate>

        {/* 9. Campaigns (KPI metrics) – renamed from "Campaigns (overview)" (Premium) */}
        <PremiumGate enabled={premium} label="Campaigns (KPI metrics)">
          <CampaignsOverview
            titleOverride="Campaigns (KPI metrics)"
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
          />
        </PremiumGate>

        {/* 10. Landing Pages × Attribution (Premium) */}
        <PremiumGate enabled={premium} label="Landing Pages × Attribution">
          <LandingPages
            propertyId={propertyId}
            startDate={startDate}
            endDate={endDate}
            filters={appliedFilters}
          />
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
      </div>
    </main>
  );
}

/* =============================================================================
   CHANNELS HERO (appears at top when data exists)
   ============================================================================= */
function ChannelsHero({
  rows,
  totals,
  prevRows,
  prevTotals,
  startDate,
  endDate,
  appliedFilters,
  refreshSignal,
}) {
  return (
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
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
          payload={{
            rows,
            totals,
            dateRange: { start: startDate, end: endDate },
            filters: appliedFilters,
          }}
          resetSignal={refreshSignal}
        />
        <span aria-hidden style={{ marginLeft: "auto", color: COLORS.subtext, fontSize: 12 }}>
          {startDate} → {endDate}
        </span>
      </div>

      <ul style={{ marginTop: 12 }}>
        <li>
          <b>Total sessions:</b> {totals.sessions.toLocaleString()}
        </li>
        <li>
          <b>Total users:</b> {totals.users.toLocaleString()}
        </li>
        {rows[0] && (
          <li>
            <b>Top channel:</b> {rows[0].channel} with {rows[0].sessions.toLocaleString()} sessions (
            {totals.sessions > 0 ? Math.round((rows[0].sessions / totals.sessions) * 100) : 0}% of
            total)
          </li>
        )}
        {prevRows?.length > 0 && (
          <>
            <li style={{ marginTop: 6 }}>
              <b>Sessions vs previous:</b>{" "}
              {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev{" "}
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
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Channel
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                Sessions
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                Users
              </th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                % of Sessions
              </th>
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
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {pct}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Use next/image (unoptimized) to avoid Next domain config + no-img-element warnings */}
      {rows?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Image
            src={buildChannelPieUrl(rows)}
            alt="Channel share chart"
            unoptimized
            width={800}
            height={520}
            style={{ width: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
          />
        </div>
      )}
    </section>
  );
}

/* =============================================================================
   REUSABLE AI block
   ============================================================================= */
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
      <button onClick={run} style={styles.ghost} disabled={loading}>
        {loading ? "Summarising…" : asButton ? buttonLabel : "Summarise with AI"}
      </button>
      <button onClick={copy} style={styles.ghost} disabled={!text}>
        {copied ? "Copied!" : "Copy insight"}
      </button>
      {error && <span style={{ color: COLORS.danger }}>Error: {error}</span>}
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

/* =============================================================================
   SAVED VIEWS (Premium)
   ============================================================================= */
function SavedViews({
  startDate,
  endDate,
  countrySel,
  channelSel,
  comparePrev,
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
    <section style={{ ...styles.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Saved Views</h3>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view (e.g. UK · Organic · Sep)"
          style={{ padding: 8, minWidth: 260 }}
          aria-label="Saved view name"
        />
        <button onClick={saveCurrent} style={styles.ghost}>
          Save current
        </button>
        {notice && <span style={{ color: COLORS.success, fontSize: 12 }}>{notice}</span>}
      </div>

      {presets.length > 0 ? (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {presets.map((p) => (
            <div
              key={p.name}
              style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
            >
              <div style={{ minWidth: 280 }}>
                <b>{p.name}</b>{" "}
                <span style={{ color: COLORS.subtext, fontSize: 12 }}>
                  {p.startDate} → {p.endDate} · {p.country} · {p.channelGroup}{" "}
                  {p.comparePrev ? "· compare" : ""}
                </span>
              </div>
              <button onClick={() => apply(p, false)} style={styles.ghost}>
                Apply
              </button>
              <button onClick={() => apply(p, true)} style={styles.ghost}>
                Apply & Run
              </button>
              <button onClick={() => remove(p)} style={{ ...styles.ghost, color: COLORS.danger }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ marginTop: 8, color: COLORS.subtext, fontSize: 13 }}>
          No saved views yet. Set dates/filters, give it a name, then “Save current”.
        </p>
      )}
    </section>
  );
}

/* =============================================================================
   KPI TARGETS + ANOMALY ALERTS + DIGEST (Premium)
   ============================================================================= */
function TargetsAlertsDigest({ chTotals, startDate, endDate, appliedFilters, refreshSignal }) {
  // Saved KPI targets UI
  const [targets, setTargets] = useState(() => loadKpiTargets());
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTargets(loadKpiTargets());
  }, [refreshSignal]);

  const save = () => {
    try {
      localStorage.setItem("insightgpt_kpi_targets_v1", JSON.stringify(targets || {}));
      setNotice("Targets saved.");
      setTimeout(() => setNotice(""), 1200);
    } catch {
      setNotice("Could not save.");
      setTimeout(() => setNotice(""), 1400);
    }
  };

  // Alerts config (stored)
  const [alerts, setAlerts] = useState(() => {
    try {
      const raw = localStorage.getItem("insightgpt_alerts_cfg_v1");
      return raw ? JSON.parse(raw) : {
        enabled: false,
        sensitivityZ: 2,
        lookbackDays: 28,
        metrics: { sessions: true, revenue: true, cvr: true },
        slackWebhook: "",
      };
    } catch {
      return {
        enabled: false,
        sensitivityZ: 2,
        lookbackDays: 28,
        metrics: { sessions: true, revenue: true, cvr: true },
        slackWebhook: "",
      };
    }
  });
  const [alertsSaved, setAlertsSaved] = useState("");

  const persistAlerts = () => {
    try {
      localStorage.setItem("insightgpt_alerts_cfg_v1", JSON.stringify(alerts || {}));
      setAlertsSaved("Alerts settings saved.");
      setTimeout(() => setAlertsSaved(""), 1200);
    } catch {
      setAlertsSaved("Could not save.");
      setTimeout(() => setAlertsSaved(""), 1400);
    }
  };

  // Test Slack delivery of anomalies (client -> backend -> Slack webhook)
  const testSlackAnomalies = async () => {
    try {
      const body = {
        propertyId: document.getElementById("property-id")?.value || "",
        dateRange: { start: startDate, end: endDate },
        filters: appliedFilters,
        config: {
          sensitivityZ: alerts.sensitivityZ,
          lookbackDays: alerts.lookbackDays,
          metrics: alerts.metrics,
        },
        slackWebhook: alerts.slackWebhook,
        // Also include a short AI summary; backend can call /api/insights/summarise-pro if desired.
        includeSummary: true,
      };
      const res = await fetch("/api/slack/anomalies-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      alert(json?.ok ? "Sent test anomalies to Slack." : `Slack test failed: ${json?.error || "Unknown error"}`);
    } catch (e) {
      alert(`Slack test failed: ${String(e?.message || e)}`);
    }
  };

  // Performance digest (Slack)
  const [digest, setDigest] = useState(() => {
    try {
      const raw = localStorage.getItem("insightgpt_digest_cfg_v1");
      return raw
        ? JSON.parse(raw)
        : { enabled: false, frequency: "weekly", localTime: "09:00", slackWebhook: "" };
    } catch {
      return { enabled: false, frequency: "weekly", localTime: "09:00", slackWebhook: "" };
    }
  });
  const [digestSaved, setDigestSaved] = useState("");

  const persistDigest = () => {
    try {
      localStorage.setItem("insightgpt_digest_cfg_v1", JSON.stringify(digest || {}));
      setDigestSaved("Digest settings saved.");
      setTimeout(() => setDigestSaved(""), 1200);
    } catch {
      setDigestSaved("Could not save.");
      setTimeout(() => setDigestSaved(""), 1400);
    }
  };

  const testDigestSlack = async () => {
    try {
      const body = {
        propertyId: document.getElementById("property-id")?.value || "",
        dateRange: { start: startDate, end: endDate },
        filters: appliedFilters,
        slackWebhook: digest.slackWebhook,
        // include AI narrative (channels, pages, ecom, etc.)
        includeSummary: true,
      };
      const res = await fetch("/api/slack/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      alert(json?.ok ? "Sent test Performance Digest to Slack." : `Digest test failed: ${json?.error || "Unknown error"}`);
    } catch (e) {
      alert(`Digest test failed: ${String(e?.message || e)}`);
    }
  };

  const kpiProgress = {
    sessions: {
      current: Number(chTotals?.sessions || 0),
      target: Number(targets?.sessionsTarget || 0),
    },
  };

  return (
    <section style={styles.card} aria-label="KPI Targets & Alerts / Digest">
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>KPI Targets & Alerts / Digest</h3>
        {kpiProgress.sessions.target > 0 && (
          <TargetBadge label="Sessions" current={kpiProgress.sessions.current} target={kpiProgress.sessions.target} />
        )}
        <button onClick={() => setOpen((o) => !o)} style={styles.ghost}>
          {open ? "Hide settings" : "Show settings"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "grid", gap: 16 }}>
          {/* KPI Targets */}
          <div>
            <h4 style={{ margin: "0 0 8px" }}>KPI Targets</h4>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label>
                <span style={styles.label}>Sessions target</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={targets.sessionsTarget ?? ""}
                  onChange={(e) => setTargets({ ...targets, sessionsTarget: Number(e.target.value) })}
                  style={{ padding: 8, minWidth: 140, display: "block" }}
                />
              </label>

              <label>
                <span style={styles.label}>Revenue target (GBP)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={targets.revenueTarget ?? ""}
                  onChange={(e) => setTargets({ ...targets, revenueTarget: Number(e.target.value) })}
                  style={{ padding: 8, minWidth: 160, display: "block" }}
                />
              </label>

              <label>
                <span style={styles.label}>CVR target (%)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="0.01"
                  value={targets.cvrTarget ?? ""}
                  onChange={(e) => setTargets({ ...targets, cvrTarget: Number(e.target.value) })}
                  style={{ padding: 8, minWidth: 140, display: "block" }}
                />
              </label>
            </div>

            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={save} style={styles.btn}>
                Save targets
              </button>
              {notice && <span style={{ color: COLORS.success, fontSize: 12 }}>{notice}</span>}
            </div>
          </div>

          {/* Anomaly Alerts */}
          <div>
            <h4 style={{ margin: "0 0 8px" }}>Anomaly Alerts (Slack)</h4>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!alerts.enabled}
                  onChange={(e) => setAlerts({ ...alerts, enabled: e.target.checked })}
                />
                <span>Enabled</span>
              </label>

              <label>
                <span style={styles.label}>Sensitivity (z)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="0.1"
                  value={alerts.sensitivityZ}
                  onChange={(e) => setAlerts({ ...alerts, sensitivityZ: Number(e.target.value) })}
                  style={{ padding: 8, minWidth: 120, display: "block" }}
                />
              </label>

              <label>
                <span style={styles.label}>Lookback days</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={alerts.lookbackDays}
                  onChange={(e) => setAlerts({ ...alerts, lookbackDays: Number(e.target.value) })}
                  style={{ padding: 8, minWidth: 120, display: "block" }}
                />
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!alerts.metrics?.sessions}
                    onChange={(e) =>
                      setAlerts({ ...alerts, metrics: { ...alerts.metrics, sessions: e.target.checked } })
                    }
                  />
                  <span>Sessions</span>
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!alerts.metrics?.revenue}
                    onChange={(e) =>
                      setAlerts({ ...alerts, metrics: { ...alerts.metrics, revenue: e.target.checked } })
                    }
                  />
                  <span>Revenue</span>
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!alerts.metrics?.cvr}
                    onChange={(e) =>
                      setAlerts({ ...alerts, metrics: { ...alerts.metrics, cvr: e.target.checked } })
                    }
                  />
                  <span>CVR</span>
                </label>
              </div>

              <label style={{ flex: "1 1 300px" }}>
                <span style={styles.label}>Slack Incoming Webhook URL</span>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/XXX/YYY/ZZZ"
                  value={alerts.slackWebhook || ""}
                  onChange={(e) => setAlerts({ ...alerts, slackWebhook: e.target.value })}
                  style={{ padding: 8, width: "100%", display: "block" }}
                />
              </label>
            </div>

            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={persistAlerts} style={styles.btn}>
                Save alerts
              </button>
              <button
                onClick={testSlackAnomalies}
                style={styles.ghost}
                disabled={!alerts.slackWebhook}
                title={!alerts.slackWebhook ? "Add Slack webhook first" : "Send test anomalies to Slack"}
              >
                Send anomalies test to Slack
              </button>
              {alertsSaved && <span style={{ color: COLORS.success, fontSize: 12 }}>{alertsSaved}</span>}
            </div>
          </div>

          {/* Performance Digest */}
          <div>
            <h4 style={{ margin: "0 0 8px" }}>Performance Digest (Slack)</h4>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!digest.enabled}
                  onChange={(e) => setDigest({ ...digest, enabled: e.target.checked })}
                />
                <span>Enabled</span>
              </label>

              <label>
                <span style={styles.label}>Frequency</span>
                <select
                  value={digest.frequency}
                  onChange={(e) => setDigest({ ...digest, frequency: e.target.value })}
                  style={{ padding: 8 }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>

              <label>
                <span style={styles.label}>Local time (24h)</span>
                <input
                  type="time"
                  value={digest.localTime}
                  onChange={(e) => setDigest({ ...digest, localTime: e.target.value })}
                  style={{ padding: 8, minWidth: 120 }}
                />
              </label>

              <label style={{ flex: "1 1 300px" }}>
                <span style={styles.label}>Slack Incoming Webhook URL</span>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/XXX/YYY/ZZZ"
                  value={digest.slackWebhook || ""}
                  onChange={(e) => setDigest({ ...digest, slackWebhook: e.target.value })}
                  style={{ padding: 8, width: "100%", display: "block" }}
                />
              </label>
            </div>

            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button onClick={persistDigest} style={styles.btn}>
                Save digest
              </button>
              <button
                onClick={testDigestSlack}
                style={styles.ghost}
                disabled={!digest.slackWebhook}
                title={!digest.slackWebhook ? "Add Slack webhook first" : "Send test digest to Slack"}
              >
                Send digest test to Slack
              </button>
              {digestSaved && <span style={{ color: COLORS.success, fontSize: 12 }}>{digestSaved}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* =============================================================================
   Source / Medium
   ============================================================================= */
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
  const totalSessions = useMemo(
    () => rows.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [rows]
  );
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Source / Medium</h3>
        <button onClick={load} style={styles.ghost} disabled={loading || !propertyId}>
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
            downloadCsvGeneric(`source_medium_${startDate}_to_${endDate}`, rows, [
              { header: "Source", key: "source" },
              { header: "Medium", key: "medium" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
            ])
          }
          style={styles.ghost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Source
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Medium
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
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
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* =============================================================================
   Campaigns (overview) – renamed to Campaigns (KPI metrics) when titleOverride passed
   ============================================================================= */
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

  const totalSessions = useMemo(
    () => rows.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [rows]
  );
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Campaigns</h3>
        <button onClick={load} style={styles.ghost} disabled={loading || !propertyId}>
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
            downloadCsvGeneric(`campaigns_${startDate}_to_${endDate}`, rows, [
              { header: "Campaign", key: "campaign" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
            ])
          }
          style={styles.ghost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Campaign
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
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
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* =============================================================================
   Campaign drill-down
   ============================================================================= */
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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Campaign drill-down</h3>

        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="Type exact campaign name…"
          style={{ padding: 8, minWidth: 260 }}
        />
        <button
          onClick={load}
          style={styles.ghost}
          disabled={loading || !propertyId || !campaign}
          title={!propertyId ? "Enter a GA4 property ID first" : ""}
        >
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

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {totals && (
        <div style={{ marginTop: 12 }}>
          <b>Totals for \u201C{campaign}\u201D:</b> Sessions {totals.sessions.toLocaleString()} ·
          Users {totals.users.toLocaleString()} · Transactions{" "}
          {totals.transactions.toLocaleString()} · Revenue{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
            totals.revenue || 0
          )}{" "}
          · CVR {(cvr || 0).toFixed(2)}% · AOV{" "}
          {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov || 0)}
        </div>
      )}

      {srcMed.length > 0 && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <h4 style={{ margin: "12px 0 6px" }}>By Source / Medium</h4>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Source
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Medium
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Transactions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {srcMed.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.d1 || "(not set)"}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.d2 || "(not set)"}</td>
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
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.revenue || 0
                    )}
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
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Ad Content
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Transactions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {content.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.content}</td>
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
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.revenue || 0
                    )}
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
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Term
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Transactions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {term.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.term}</td>
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
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.revenue || 0
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && !loading && !totals && (
        <p style={{ marginTop: 8, color: COLORS.subtext }}>
          Enter a campaign name and click “Load Campaign Details”.
        </p>
      )}
    </section>
  );
}

/* =============================================================================
   Campaigns Overview (renamed: Campaigns (KPI metrics) via titleOverride)
   ============================================================================= */
function CampaignsOverview({ propertyId, startDate, endDate, filters, titleOverride }) {
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

  const totalSessions = useMemo(
    () => visible.reduce((sum, r) => sum + (r.sessions || 0), 0),
    [visible]
  );
  const kpiTargets = useMemo(() => loadKpiTargets(), []);

  return (
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>{titleOverride || "Campaigns (overview)"}</h3>

        <button onClick={load} style={styles.ghost} disabled={loading || !propertyId}>
          {loading ? "Loading…" : "Load Campaigns"}
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search campaign name…"
          style={{ padding: 8, minWidth: 220 }}
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
          style={styles.ghost}
          disabled={!visible.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {visible.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Campaign
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Transactions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Revenue
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  CVR
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  AOV
                </th>
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
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.revenue || 0
                    )}
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {r.cvr.toFixed(2)}%
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.aov || 0
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* =============================================================================
   Top Pages
   ============================================================================= */
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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Top pages (views)</h3>
        <button onClick={load} style={styles.ghost} disabled={loading || !propertyId}>
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
          style={styles.ghost}
          disabled={!rows.length}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Page Title
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Path
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Views
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.path}-${i}`}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.title}</td>
                  <td
                    style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}
                  >
                    {r.path}
                  </td>
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
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* =============================================================================
   Landing Pages × Attribution (Premium)
   ============================================================================= */
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

  const maxSessions = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.sessions || 0), 0),
    [rows]
  );

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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Landing Pages × Attribution</h3>

        <button
          onClick={load}
          style={styles.ghost}
          disabled={loading || !propertyId}
          title={!propertyId ? "Enter a GA4 property ID first" : ""}
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
            rows: filtered.slice(0, 50).map((r) => ({
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

        <button onClick={exportCsv} style={styles.ghost} disabled={!filtered.length}>
          Download CSV
        </button>
      </div>

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
          <span style={{ fontSize: 12, color: COLORS.subtext }}>
            Showing <b>{shownCount.toLocaleString()}</b> of {totalCount.toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {filtered.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Landing Page
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Source
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Medium
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Sessions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Users
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Transactions
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._k}>
                  <td
                    style={{ padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" }}
                  >
                    {r.landing}
                  </td>
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
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.revenue || 0
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <p style={{ marginTop: 8, color: COLORS.subtext }}>
            {rows.length ? "No rows match your view filters." : "No rows loaded yet."}
          </p>
        )
      )}
    </section>
  );
}

/* =============================================================================
   E-commerce KPIs
   ============================================================================= */
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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button onClick={load} style={styles.ghost} disabled={loading || !propertyId}>
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
            <TargetBadge label="CVR" current={Number(totals?.cvr || 0)} target={Number(kpiTargets?.cvrTarget)} />
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

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}
      {!error && totals && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Metric
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Value
                </th>
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
                value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                  totals.revenue || 0
                )}
              />
              <Tr label="Conversion Rate (purchase / session)" value={`${(totals.cvr || 0).toFixed(2)}%`} />
              <Tr
                label="AOV (Revenue / Transactions)"
                value={new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                  totals.aov || 0
                )}
              />
            </tbody>
          </table>
        </div>
      )}
      {!error && !totals && <p style={{ marginTop: 8, color: COLORS.subtext }}>No data loaded yet.</p>}
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

/* =============================================================================
   Checkout Funnel
   ============================================================================= */
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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Checkout funnel (event counts)</h3>
        <button onClick={load} style={styles.ghost} disabled={loading || !propertyId}>
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
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {steps ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: 520 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Step
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Count
                </th>
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
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* =============================================================================
   Trends Over Time (Premium)
   ============================================================================= */
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
      const data = await fetchJson("/api/ga4/timeseries", {
        propertyId,
        startDate,
        endDate,
        filters,
        granularity,
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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Trends over time</h3>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={styles.label}>Granularity</span>
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)} style={{ padding: 6 }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <button
          onClick={load}
          style={styles.ghost}
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
            downloadCsvGeneric(`timeseries_${granularity}_${startDate}_to_${endDate}`, rows, [
              { header: "Period", key: "period" },
              { header: "Sessions", key: "sessions" },
              { header: "Users", key: "users" },
              { header: "Transactions", key: "transactions" },
              { header: "Revenue", key: "revenue" },
            ])
          }
          style={styles.ghost}
          disabled={!hasRows}
        >
          Download CSV
        </button>
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {hasRows ? (
        <>
          <div style={{ marginTop: 12 }}>
            <Image
              src={buildLineChartUrl(rows)}
              alt="Sessions & Users trend"
              unoptimized
              width={1000}
              height={480}
              style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
            />
          </div>

          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Period
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Sessions
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Users
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Transactions
                  </th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                    Revenue
                  </th>
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
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                          r.revenue || 0
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !error && <p style={{ marginTop: 8, color: COLORS.subtext }}>No rows loaded yet.</p>
      )}
    </section>
  );
}

/* =============================================================================
   Product Performance (feature-flag)
   ============================================================================= */
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
    <section style={{ ...styles.card, marginTop: 14 }}>
      <div style={styles.sectionTitleRow}>
        <h3 style={{ margin: 0 }}>Product Performance</h3>
        <button
          onClick={load}
          style={styles.ghost}
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
            rows: rows.slice(0, 50).map((r) => ({
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

        <button onClick={exportCsv} style={styles.ghost} disabled={!rows.length}>
          Download CSV
        </button>

        <span style={{ color: COLORS.subtext, fontSize: 12 }}>Respects global filters.</span>
      </div>

      {error && (
        <p style={{ color: COLORS.danger, marginTop: 12, whiteSpace: "pre-wrap" }}>Error: {error}</p>
      )}

      {rows.length > 0 ? (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Item
                </th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Item ID
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Items viewed
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Items added to cart
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Items purchased
                </th>
                <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 8 }}>
                  Item revenue
                </th>
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
                    {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
                      r.revenue || 0
                    )}
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
            }}
          >
            {JSON.stringify(debug, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

/* =============================================================================
   CHANGE LOG / NOTES (displayed after the code block in the chat)
   ============================================================================= */
