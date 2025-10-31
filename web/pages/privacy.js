// /workspaces/insightsgpt/web/pages/privacy.js
export default function Privacy() {
  return (
    <main style={{maxWidth: 820, margin: "40px auto", padding: "0 20px", lineHeight: 1.6}}>
      <h1>Privacy Policy – AnalyticsAssistant.ai</h1>
      <p><em>Last updated: {new Date().toISOString().slice(0,10)}</em></p>

      <h2>Overview</h2>
      <p>
        AnalyticsAssistant.ai connects to your Google Analytics 4 (GA4) account with your permission to
        read reporting data. We request the minimum scope (<code>analytics.readonly</code>) and we never
        modify your Analytics properties or data.
      </p>

      <h2>What we access</h2>
      <ul>
        <li>GA4 reporting metrics and dimensions you request inside the app (e.g. sessions, conversions, traffic sources).</li>
        <li>Account and property listings to let you choose the correct GA4 property.</li>
      </ul>

      <h2>How we store access</h2>
      <p>
        We store an encrypted session cookie in your browser to keep you signed in. Access and refresh tokens
        are stored securely on the server. In production, token data is kept in a managed key–value store.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not change, delete, or create anything in your Google Analytics account.</li>
        <li>We do not sell your data.</li>
        <li>We do not share your GA4 data with third parties except our processors (e.g. hosting).</li>
      </ul>

      <h2>Disconnecting</h2>
      <p>
        You can disconnect GA4 at any time from within the app; we will remove our stored tokens immediately.
        You can also revoke access from your Google Account security settings.
      </p>

      <h2>Data retention</h2>
      <p>
        Session data is retained only as long as needed to provide the service. Server logs may be kept for
        short periods to diagnose issues.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href="mailto:contact@analyticsassistant.ai">contact@analyticsassistant.ai</a>.
      </p>
    </main>
  );
}
