// web/pages/admin/costs.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import { PrismaClient } from "@prisma/client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";

const prisma = new PrismaClient();

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Cost estimation based on typical pricing
const COST_ESTIMATES = {
  vercel: {
    // Vercel Pro: $20/month base + usage
    base: 20,
    functionInvocations: 0.0000002, // $0.20 per million
    bandwidth: 0.0001, // $0.10 per GB
  },
  database: {
    // Neon PostgreSQL: Free tier up to 0.5GB, then ~$0.10/GB
    base: 0,
    storagePerGB: 0.10,
    computeHours: 0.10, // per hour for compute
  },
  kv: {
    // Vercel KV / Upstash: Free tier up to 10K reads/day, then pay-as-you-go
    base: 0,
    readsPerMillion: 0.20,
    writesPerMillion: 0.20,
  },
  stripe: {
    // Stripe fees: 2.9% + $0.30 per transaction
    percentage: 0.029,
    fixed: 0.30,
  },
  ai: {
    // Estimated AI API costs (adjust based on your provider)
    perSummary: 0.01, // $0.01 per AI summary
  },
};

function calculateMonthlyRevenue(users) {
  const monthly = users.filter((u) => u.premium && u.plan === "monthly").length;
  const annual = users.filter((u) => u.premium && u.plan === "annual").length;
  // $24.99/month, $19.99/month annual (paid annually)
  const monthlyRevenue = monthly * 24.99;
  const annualMonthlyEquivalent = (annual * 19.99 * 12) / 12; // Annual paid monthly
  return monthlyRevenue + annualMonthlyEquivalent;
}

function estimateCosts(stats) {
  const { totalUsers, premiumUsers, aiSummaries, ga4Reports, dbSizeGB, kvOps } = stats;

  // Vercel costs (estimated)
  const functionInvocations = (ga4Reports + aiSummaries) * 2; // Each report triggers multiple functions
  const vercelCosts =
    COST_ESTIMATES.vercel.base +
    (functionInvocations * COST_ESTIMATES.vercel.functionInvocations * 1000000) +
    (stats.bandwidthGB || 10) * COST_ESTIMATES.vercel.bandwidth;

  // Database costs
  const dbCosts = dbSizeGB > 0.5 ? (dbSizeGB - 0.5) * COST_ESTIMATES.database.storagePerGB : 0;

  // KV costs (estimated)
  const kvCosts = kvOps.reads > 10000 ? ((kvOps.reads - 10000) / 1000000) * COST_ESTIMATES.kv.readsPerMillion : 0;
  const kvWritesCost = (kvOps.writes / 1000000) * COST_ESTIMATES.kv.writesPerMillion;

  // AI costs
  const aiCosts = aiSummaries * COST_ESTIMATES.ai.perSummary;

  // Stripe fees (on revenue)
  const revenue = calculateMonthlyRevenue(stats.users || []);
  const stripeFees = revenue * COST_ESTIMATES.stripe.percentage + premiumUsers * COST_ESTIMATES.stripe.fixed;

  return {
    vercel: Math.round(vercelCosts * 100) / 100,
    database: Math.round(dbCosts * 100) / 100,
    kv: Math.round((kvCosts + kvWritesCost) * 100) / 100,
    ai: Math.round(aiCosts * 100) / 100,
    stripe: Math.round(stripeFees * 100) / 100,
    total: Math.round((vercelCosts + dbCosts + kvCosts + kvWritesCost + aiCosts + stripeFees) * 100) / 100,
  };
}

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) return { redirect: { destination: "/start", permanent: false } };

  const adminEmails = parseAdminEmails();
  const email = session.user?.email?.toLowerCase?.() || "";
  const isAdmin = adminEmails.includes(email);

  if (!isAdmin) {
    return {
      props: {
        unauthorized: true,
        sessionEmail: session.user?.email || null,
      },
    };
  }

  // Get user stats
  const users = await prisma.user.findMany({
    select: {
      id: true,
      premium: true,
      plan: true,
      createdAt: true,
    },
  });

  const totalUsers = users.length;
  const premiumUsers = users.filter((u) => u.premium).length;
  const freeUsers = totalUsers - premiumUsers;

  // Fetch real cost data from API
  let costData = null;
  let costError = null;
  try {
    const protocol = ctx.req.headers["x-forwarded-proto"] || "http";
    const host = ctx.req.headers.host || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;
    
    const costResponse = await fetch(`${baseUrl}/api/admin/costs`, {
      headers: {
        cookie: ctx.req.headers.cookie || "",
      },
    });

    if (costResponse.ok) {
      costData = await costResponse.json();
    } else {
      costError = `Failed to fetch cost data: ${costResponse.status}`;
    }
  } catch (error) {
    costError = error.message;
  }

  // Fallback to estimates if API fails
  const stats = {
    totalUsers,
    premiumUsers,
    freeUsers,
    aiSummaries: costData?.usage?.ai?.requests || Math.round(premiumUsers * 50 + freeUsers * 5),
    ga4Reports: Math.round(premiumUsers * 200 + freeUsers * 10), // Still estimated
    dbSizeGB: costData?.usage?.database?.storageGB || 0.1,
    bandwidthGB: costData?.usage?.vercel?.bandwidthGB || 10,
    kvOps: {
      reads: costData?.usage?.kv?.reads || totalUsers * 1000,
      writes: costData?.usage?.kv?.writes || totalUsers * 100,
    },
    users,
    costData: costData || null,
    costError,
  };

  const costs = costData?.costs || estimateCosts(stats);
  const revenue = calculateMonthlyRevenue(users);

  return {
    props: {
      stats: JSON.parse(JSON.stringify(stats)),
      costs,
      revenue: Math.round(revenue * 100) / 100,
      unauthorized: false,
      dataSource: costData ? "api" : "estimated",
    },
  };
}

export default function AdminCosts({ stats, costs, revenue, unauthorized, sessionEmail, dataSource }) {
  const [alertThreshold, setAlertThreshold] = useState(500); // Default $500/month
  const [showAlerts, setShowAlerts] = useState(true);

  useEffect(() => {
    // Load saved threshold from localStorage
    const saved = localStorage.getItem("admin_cost_alert_threshold");
    if (saved) setAlertThreshold(parseFloat(saved));
  }, []);

  const handleThresholdChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    setAlertThreshold(value);
    localStorage.setItem("admin_cost_alert_threshold", value.toString());
  };

  const exceedsThreshold = costs.total > alertThreshold;
  const profitMargin = revenue > 0 ? ((revenue - costs.total) / revenue) * 100 : 0;

  if (unauthorized) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Admin access required</h1>
        <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
          You&apos;re signed in as <strong>{sessionEmail || "unknown user"}</strong>, but this page is limited to admin
          accounts only.
        </p>
        <Link href="/admin/users" style={{ color: "#2563EB", fontWeight: 600 }}>
          ← Back to admin
        </Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Cost Monitoring Dashboard</h1>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Data source: <strong>{dataSource === "api" ? "Real-time API" : "Estimated"}</strong>
            {dataSource === "api" && (
              <span style={{ marginLeft: 8, color: "#10b981" }}>✓ Live data</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Refresh
          </button>
          <Link href="/admin/users" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>
            ← Users Dashboard
          </Link>
        </div>
      </div>

      {stats.costError && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#7f1d1d",
            marginBottom: 24,
          }}
        >
          <strong>⚠️ Cost API Error:</strong> {stats.costError}. Showing estimated costs. Check your API credentials in environment variables.
        </div>
      )}

      {/* Alert Banner */}
      {showAlerts && exceedsThreshold && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#7f1d1d",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong>⚠️ Cost Alert:</strong> Monthly costs (${costs.total.toFixed(2)}) exceed threshold (${alertThreshold.toFixed(2)})
          </div>
          <button
            onClick={() => setShowAlerts(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "#7f1d1d",
              cursor: "pointer",
              fontSize: 18,
              padding: "0 8px",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <div style={{ padding: 20, borderRadius: 12, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
          <div style={{ fontSize: 14, color: "#0369a1", fontWeight: 600, marginBottom: 8 }}>Monthly Revenue</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#0c4a6e" }}>${revenue.toFixed(2)}</div>
        </div>
        <div style={{ padding: 20, borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca" }}>
          <div style={{ fontSize: 14, color: "#991b1b", fontWeight: 600, marginBottom: 8 }}>Monthly Costs</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#7f1d1d" }}>${costs.total.toFixed(2)}</div>
        </div>
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            background: profitMargin > 0 ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${profitMargin > 0 ? "#86efac" : "#fecaca"}`,
          }}
        >
          <div style={{ fontSize: 14, color: profitMargin > 0 ? "#166534" : "#991b1b", fontWeight: 600, marginBottom: 8 }}>
            Profit Margin
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: profitMargin > 0 ? "#14532d" : "#7f1d1d" }}>
            {profitMargin.toFixed(1)}%
          </div>
        </div>
        <div style={{ padding: 20, borderRadius: 12, background: "#faf5ff", border: "1px solid #d8b4fe" }}>
          <div style={{ fontSize: 14, color: "#6b21a8", fontWeight: 600, marginBottom: 8 }}>Total Users</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#581c87" }}>{stats.totalUsers}</div>
          <div style={{ fontSize: 12, color: "#6b21a8", marginTop: 4 }}>
            {stats.premiumUsers} premium, {stats.freeUsers} free
          </div>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Cost Breakdown</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {[
            { 
              label: "Vercel Hosting", 
              value: costs.vercel, 
              color: "#3b82f6",
              note: stats.costData?.usage?.vercel?.skipped ? " (estimated - check Vercel dashboard)" : ""
            },
            { label: "Database (Neon)", value: costs.database, color: "#10b981" },
            { label: "KV Storage", value: costs.kv, color: "#f59e0b" },
            { label: "AI API", value: costs.ai, color: "#8b5cf6" },
            { label: "Stripe Fees", value: costs.stripe, color: "#6366f1" },
          ].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 200, fontSize: 14, fontWeight: 500 }}>
                {item.label}
                {item.note && <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>{item.note}</span>}
              </div>
              <div style={{ flex: 1, height: 24, background: "#e5e7eb", borderRadius: 12, position: "relative", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${costs.total > 0 ? (item.value / costs.total) * 100 : 0}%`,
                    height: "100%",
                    background: item.color,
                    borderRadius: 12,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div style={{ width: 100, textAlign: "right", fontSize: 14, fontWeight: 600 }}>${item.value.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Usage Stats */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Usage Statistics (Estimated)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
          <div style={{ padding: 16, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>GA4 Reports (this month)</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.ga4Reports.toLocaleString()}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>AI Summaries (this month)</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.aiSummaries.toLocaleString()}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Database Size</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.dbSizeGB.toFixed(2)} GB</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>KV Operations</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>
              {(stats.kvOps.reads + stats.kvOps.writes).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Settings */}
      <div style={{ padding: 20, borderRadius: 12, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Cost Alert Settings</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 500 }}>Alert when costs exceed:</label>
          <input
            type="number"
            value={alertThreshold}
            onChange={handleThresholdChange}
            min="0"
            step="10"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              width: 120,
              fontSize: 14,
            }}
          />
          <span style={{ fontSize: 14, color: "#6b7280" }}>per month</span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, marginBottom: 0 }}>
          Current costs: <strong>${costs.total.toFixed(2)}</strong> | Threshold:{" "}
          <strong>${alertThreshold.toFixed(2)}</strong>
        </p>
      </div>

      {/* Notes */}
      <div style={{ marginTop: 32, padding: 16, borderRadius: 12, background: "#fffbeb", border: "1px solid #fde047" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>📝 Notes</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#713f12", lineHeight: 1.6 }}>
          <li>
            <strong>Vercel costs:</strong> Check actual hosting costs in{" "}
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: "#713f12", textDecoration: "underline" }}>
              Vercel Dashboard → Settings → Billing
            </a>
            . API tracking requires a Vercel Integration token (advanced setup).
          </li>
          <li>
            <strong>Other costs:</strong> Database (Neon), KV (Upstash), AI (OpenAI), and Stripe fees are tracked automatically when API credentials are configured.
          </li>
          <li>
            <strong>Setup:</strong> See <code>docs/COST_TRACKING_SETUP.md</code> for API credential setup instructions.
          </li>
          <li>
            <strong>Accuracy:</strong> Costs shown are real-time when APIs are configured, or estimated based on usage patterns.
          </li>
        </ul>
      </div>
    </main>
  );
}

