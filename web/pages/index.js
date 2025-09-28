// /workspaces/insightsgpt/web/pages/index.js
import { useEffect, useMemo, useState } from "react";

/** ---------- helpers ---------- */
const STORAGE_KEY = "insightgpt_preset_v1";

// Parse the default channels response
function parseGa4Channels(response) {
  if (!response?.rows?.length) return { rows: [], totals: { sessions: 0, users: 0 } };

  const rows = response.rows.map((r) => ({
    channel: r.dimensionValues?.[0]?.value || "(unknown)",
    sessions: Number(r.metricValues?.[0]?.value || 0),
    users: Number(r.metricValues?.[1]?.value || 0),
  }));

  const totals = rows.reduce(
    (acc, r) => ({ sessions: acc.sessions + r.sessions, users: acc.users + r.users }),
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

/** CSV export for channels */
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

/** Currency formatter (GBP by default) */
const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** ---------- page ---------- */
export default function Home() {
  const [propertyId, setPropertyId] = useState("");
  const [startDate, setStartDate] = useState("2024-09-01");
  const [endDate, setEndDate] = useState("2024-09-30");
  const [comparePrev, setComparePrev] = useState(false);

  const [result, setResult] = useState(null);
  const [prevResult, setPrevResult] = useState(null);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Load preset
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.propertyId) setPropertyId(saved.propertyId);
      if (saved?.startDate) setStartDate(saved.startDate);
      if (saved?.endDate) setEndDate(saved.endDate);
    } catch {}
  }, []);

  // Save preset
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ propertyId, startDate, endDate })
      );
    } catch {}
  }, [propertyId, startDate, endDate]);

  const { rows, totals } = useMemo(() => parseGa4Channels(result), [result]);
  const { rows: prevRows, totals: prevTotals } = useMemo(
    () => parseGa4Channels(prevResult),
    [prevResult]
  );

  const top = rows[0];
  const topShare =
    top && totals.sessions > 0 ? Math.round((top.sessions / totals.sessions) * 100) : 0;

  const connect = () => {
    window.location.href = "/api/auth/google/start";
  };

  async function fetchGa4Channels({ propertyId, startDate, endDate }) {
    const res = await fetch("/api/ga4/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, startDate, endDate }),
    });
    const txt = await res.text();
    let json = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {}
    if (!res.ok) {
      throw new Error(
        (json && (json.error || json.message)) || txt || `HTTP ${res.status}`
      );
    }
    return json;
  }

  const runReport = async () => {
    setError("");
    setResult(null);
    setPrevResult(null);
    setLoading(true);
    try {
      // Current period
      const curr = await fetchGa4Channels({ propertyId, startDate, endDate });
      setResult(curr);

      // Previous period (optional)
      if (comparePrev) {
        const { prevStart, prevEnd } = computePreviousRange(startDate, endDate);
        const prev = await fetchGa4Channels({
          propertyId,
          startDate: prevStart,
          endDate: prevEnd,
        });
        setPrevResult(prev);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPreset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPropertyId("");
    setStartDate("2024-09-01");
    setEndDate("2024-09-30");
  };

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 4 }}>InsightGPT (MVP)</h1>
      <p style={{ marginTop: 0, color: "#555" }}>
        Connect GA4, choose a date range, and view traffic & e-commerce KPIs.
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={connect} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Connect Google Analytics
        </button>

        <label htmlFor="ga4PropertyId">
          GA4 Property ID&nbsp;
          <input
            id="ga4PropertyId"
            name="ga4PropertyId"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="e.g. 123456789"
            autoComplete="off"
            style={{ padding: 8, minWidth: 180 }}
          />
        </label>

        <label htmlFor="startDate">
          Start date&nbsp;
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            autoComplete="off"
            style={{ padding: 8 }}
          />
        </label>

        <label htmlFor="endDate">
          End date&nbsp;
          <input
            id="endDate"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            autoComplete="off"
            style={{ padding: 8 }}
          />
        </label>

        <button
          onClick={runReport}
          style={{ padding: "10px 14px", cursor: "pointer" }}
          disabled={loading || !propertyId || !startDate || !endDate}
          title={!propertyId ? "Enter GA4 Property ID" : ""}
        >
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

        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            paddingLeft: 8,
            borderLeft: "1px solid #ddd",
          }}
        >
          <input
            type="checkbox"
            checked={comparePrev}
            onChange={(e) => setComparePrev(e.target.checked)}
          />
          Compare vs previous period
        </label>

        <button
          onClick={resetPreset}
          style={{ padding: "8px 12px", cursor: "pointer", marginLeft: "auto" }}
        >
          Reset preset
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 16 }}>Error: {error}</p>}

      {/* At a glance */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24, background: "#f6f7f8", padding: 16, borderRadius: 8 }}>
          <h2 style={{ marginTop: 0 }}>At a glance</h2>
          <ul>
            <li>
              <b>Total sessions:</b> {totals.sessions.toLocaleString()}
            </li>
            <li>
              <b>Total users:</b> {totals.users.toLocaleString()}
            </li>
            {top && (
              <li>
                <b>Top channel:</b> {top.channel} with {top.sessions.toLocaleString()} sessions (
                {topShare}% of total)
              </li>
            )}
            {prevRows.length > 0 && (
              <>
                <li style={{ marginTop: 6 }}>
                  <b>Sessions vs previous:</b>{" "}
                  {formatPctDelta(totals.sessions, prevTotals.sessions)} (prev{" "}
                  {prevTotals.sessions.toLocaleString()})
                </li>
                <li>
                  <b>Users vs previous:</b>{" "}
                  {formatPctDelta(totals.users, prevTotals.users)} (prev{" "}
                  {prevTotals.users.toLocaleString()})
                </li>
              </>
            )}
          </ul>
        </section>
      )}

      {/* Table: Default Channel Group */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Traffic by Default Channel Group</h3>
          </div>
          <div style={{ overflowX: "auto" }}>
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
                  const pct =
                    totals.sessions > 0 ? Math.round((r.sessions / totals.sessions) * 100) : 0;
                  return (
                    <tr key={r.channel}>
                      <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.channel}</td>
                      <td
                        style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}
                      >
                        {r.sessions.toLocaleString()}
                      </td>
                      <td
                        style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}
                      >
                        {r.users.toLocaleString()}
                      </td>
                      <td
                        style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}
                      >
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: 8, borderTop: "2px solid #ccc" }}>
                    <b>Total</b>
                  </td>
                  <td
                    style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }}
                  >
                    <b>{totals.sessions.toLocaleString()}</b>
                  </td>
                  <td
                    style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }}
                  >
                    <b>{totals.users.toLocaleString()}</b>
                  </td>
                  <td style={{ padding: 8, textAlign: "right", borderTop: "2px solid #ccc" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Channel share chart (QuickChart) */}
      {rows.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Channel share (sessions)</h3>
          <img
            src={buildChannelPieUrl(rows)}
            alt="Channel share chart"
            style={{ maxWidth: "100%", height: "auto", border: "1px solid #eee", borderRadius: 8 }}
          />
        </section>
      )}

      {/* Raw JSON (debug) for channels */}
      {result && (
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
{JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}

      {/* ===== Ecommerce KPIs ===== */}
      <EcommerceKPIs propertyId={propertyId} startDate={startDate} endDate={endDate} />

      {/* ===== Checkout Funnel ===== */}
      <CheckoutFunnel propertyId={propertyId} startDate={startDate} endDate={endDate} />
    </main>
  );
}

/** ---------- components ---------- */

// ---------- E-commerce KPIs (totals-only) ----------
function EcommerceKPIs({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setTotals(null);
    try {
      const res = await fetch("/api/ga4/ecommerce-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });

      const txt = await res.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch {}

      if (!res.ok) {
        throw new Error((data && (data.error || data.message)) || txt || `HTTP ${res.status}`);
      }

      if (!data?.totals || !data?.dateRange) {
        throw new Error("Missing totals/dateRange");
      }

      setTotals(data.totals);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Derived KPIs: prefer transactions; otherwise fall back to itemPurchaseQuantity
  const orders =
    totals?.transactions && totals.transactions > 0
      ? totals.transactions
      : totals?.itemPurchaseQuantity && totals.itemPurchaseQuantity > 0
      ? totals.itemPurchaseQuantity
      : 0;

  const aov = orders > 0 ? totals.revenue / orders : 0;

  // Purchase rate: if GA returned purchaserRate, use it directly; otherwise estimate from views if possible
  const purchaseRate =
    typeof totals?.purchaserRate === "number"
      ? totals.purchaserRate
      : totals?.itemsViewed > 0 && orders > 0
      ? (orders / totals.itemsViewed) * 100
      : 0;

  const cartToPurchaseRate =
    totals?.addToCarts > 0 && orders > 0 ? (orders / totals.addToCarts) * 100 : 0;

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>E-commerce KPIs</h3>
        <button
          onClick={load}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !propertyId || !startDate || !endDate}
          title={!propertyId ? "Enter GA4 Property ID and dates first" : ""}
        >
          {loading ? "Loading…" : "Load E-commerce KPIs"}
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {totals && !error && (
        <div
          style={{
            marginTop: 12,
            background: "#f6f7f8",
            border: "1px solid #e5e5e5",
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>Items viewed</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {(totals.itemsViewed ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>Add-to-carts</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {(totals.addToCarts ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>
                {totals?.transactions ? "Orders" : totals?.itemPurchaseQuantity ? "Items purchased" : "Purchases"}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {orders.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>Revenue</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>
                {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(totals.revenue || 0)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>AOV</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(aov)}
              </div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>
                {typeof totals?.purchaserRate === "number" ? "Purchaser rate" : "Purchase rate (views→order)"}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {purchaseRate.toFixed(2)}%
              </div>
            </div>
            <div>
              <div style={{ color: "#666", fontSize: 12 }}>Cart→Purchase rate</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {cartToPurchaseRate.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Checkout funnel
function CheckoutFunnel({ propertyId, startDate, endDate }) {
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    setSteps(null);
    try {
      const res = await fetch("/api/ga4/checkout-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, startDate, endDate }),
      });

      const txt = await res.text();
      let data = null;
      try {
        data = txt ? JSON.parse(txt) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(
          (data && (data.error || data.message)) || txt || `HTTP ${res.status}`
        );
      }

      if (!data?.steps) {
        throw new Error("Missing steps");
      }

      setSteps(data.steps);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const s = steps || {};
  const names = [
    { key: "addToCart", label: "Add to cart" },
    { key: "beginCheckout", label: "Begin checkout" },
    { key: "addShipping", label: "Add shipping" },
    { key: "addPayment", label: "Add payment" },
    { key: "purchase", label: "Purchase" },
  ];

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Checkout funnel</h3>
        <button
          onClick={load}
          style={{ padding: "8px 12px", cursor: "pointer" }}
          disabled={loading || !propertyId || !startDate || !endDate}
        >
          {loading ? "Loading…" : "Load Checkout Funnel"}
        </button>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
          Error: {error}
        </p>
      )}

      {steps && !error && (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
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
              {names.map(({ key, label }) => (
                <tr key={key}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{label}</td>
                  <td style={{ padding: 8, textAlign: "right", borderBottom: "1px solid #eee" }}>
                    {(s[key] || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
