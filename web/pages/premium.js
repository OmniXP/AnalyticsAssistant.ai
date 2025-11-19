// web/pages/premium.js
export default function PremiumPage() {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "40px auto",
        padding: "0 20px",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        color: "#0f172a",
      }}
    >
      {/* Hero */}
      <section style={{ textAlign: "center", marginBottom: 56 }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, marginBottom: 12 }}>
          Turn GA4 into a growth plan, not just a report.
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "#475569",
            maxWidth: 640,
            margin: "0 auto 28px",
          }}
        >
          AnalyticsAssistant Pro adds deeper GA4 views, AI PRO insights, and automation—so you always know what to do next.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <a
            href="/start?upgrade=1"
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              background: "#2563EB",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Upgrade to Pro
          </a>
          <a
            href="mailto:support@analyticsassistant.ai"
            style={{
              padding: "12px 22px",
              borderRadius: 999,
              border: "1px solid #d1d5db",
              textDecoration: "none",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            Talk to us about team plans
          </a>
        </div>
        <p style={{ marginTop: 14, fontSize: 13, color: "#64748b" }}>
          Read-only GA4 access · Designed for founders & marketers · Cancel anytime via Stripe
        </p>
      </section>

      {/* Why go Premium */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>Why go Premium?</h2>
        <p style={{ color: "#475569", maxWidth: 720 }}>
          Free is perfect for quick checks and trying the workflow. Pro is for when GA4 becomes part of how you run
          the business—every week, not once a quarter.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            marginTop: 24,
          }}
        >
          <Card
            title="More headroom, fewer limits"
            body="Run far more GA4 reports and AI summaries each month without hitting the ceiling."
          />
          <Card
            title="Multiple properties, one hub"
            body="Connect several GA4 properties (brands, markets, stores) and switch between them in seconds."
          />
          <Card
            title="Full history & comparisons"
            body="Look beyond the last 90 days, compare periods, and uncover seasonality or step-changes."
          />
          <Card
            title="Summarise with AI PRO"
            body="Go deeper with hypotheses, 'why' analysis, playbooks and experiment backlogs."
          />
        </div>
      </section>

      {/* What you get */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>What you get with Pro</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
            marginTop: 16,
          }}
        >
          <Card
            title="Summarise with AI PRO"
            body="AI that explains why metrics moved and drafts a test backlog tailored to your data."
          />
          <Card
            title="Premium GA4 dashboards"
            body="Campaign drill-downs, landing page × attribution, richer trends, and e-commerce KPIs."
          />
          <Card title="Saved views & presets" body="Save your favourite filters and ranges, then reopen them instantly." />
          <Card
            title="Scheduled Slack digests"
            body="Auto-send concise performance summaries into your Slack channels on your schedule."
          />
          <Card
            title="Multi-property support"
            body="Connect multiple GA4 properties while keeping billing and usage under one Pro plan."
          />
          <Card
            title="Priority support"
            body="Faster help with GA4 quirks, tracking questions, and getting the most from the app."
          />
        </div>
      </section>

      {/* Free vs Pro */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 14 }}>Free vs Pro</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={thStyle}></th>
              <th style={thStyle}>Free</th>
              <th style={thStyle}>Pro</th>
            </tr>
          </thead>
          <tbody>
            <Row label="GA4 reports per month" free="For occasional checks" pro="For weekly use by teams" />
            <Row label="AI summaries per month" free="Just enough to try" pro="Run AI on every key report" />
            <Row label="GA4 properties" free="1 property" pro="Multiple properties" />
            <Row label="Data lookback" free="Last 90 days" pro="Full GA4 history (per GA retention)" />
            <Row label="Premium dashboards" free="Core KPIs only" pro="Campaigns, landing pages, advanced trends" />
            <Row label="Summarise with AI PRO" free="Standard summaries" pro="Hypotheses, playbooks, backlog" />
            <Row label="Slack digests & automation" free="Not included" pro="Included" />
          </tbody>
        </table>
      </section>

      {/* Social proof */}
      <section style={{ marginBottom: 48, background: "#f8fafc", borderRadius: 16, padding: 24 }}>
        <p style={{ fontSize: 18, fontStyle: "italic", color: "#0f172a", marginBottom: 8 }}>
          “Instead of wrangling GA4 every Monday, we open AnalyticsAssistant, skim the Pro summary, and update our
          roadmap. It’s like having an analyst on standby.”
        </p>
        <p style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>— Growth Lead, DTC brand</p>
      </section>

      {/* Final CTA */}
      <section style={{ textAlign: "center", marginBottom: 64 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 10 }}>
          Ready to make GA4 part of your weekly operating system?
        </h2>
        <p style={{ color: "#475569", maxWidth: 640, margin: "0 auto 20px" }}>
          Upgrade to AnalyticsAssistant Pro and turn your analytics from a reporting chore into a repeatable growth habit.
        </p>
        <a
          href="/start?upgrade=1"
          style={{
            padding: "12px 22px",
            borderRadius: 999,
            background: "#2563EB",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Upgrade to Pro
        </a>
        <p style={{ marginTop: 8 }}>
          or{" "}
          <a href="/" style={{ color: "#2563EB" }}>
            keep exploring the Free plan →
          </a>
        </p>
      </section>
    </main>
  );
}

function Card({ title, body }) {
  return (
    <div style={{ borderRadius: 14, border: "1px solid #E2E8F0", padding: 18, background: "#FFFFFF" }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</h3>
      <p style={{ color: "#475569", fontSize: 14 }}>{body}</p>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #E2E8F0",
  background: "#F8FAFC",
  fontSize: 13,
  color: "#475569",
};

function Row({ label, free, pro }) {
  return (
    <tr>
      <td style={{ padding: 10, borderBottom: "1px solid #E2E8F0", fontWeight: 600 }}>{label}</td>
      <td style={{ padding: 10, borderBottom: "1px solid #E2E8F0", color: "#475569" }}>{free}</td>
      <td style={{ padding: 10, borderBottom: "1px solid #E2E8F0", color: "#0f172a", fontWeight: 600 }}>{pro}</td>
    </tr>
  );
}

