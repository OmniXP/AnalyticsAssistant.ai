// /workspaces/insightsgpt/web/pages/terms.js
export default function Terms() {
  return (
    <main style={{maxWidth: 820, margin: "40px auto", padding: "0 20px", lineHeight: 1.6}}>
      <h1>Terms of Service – AnalyticsAssistant.ai</h1>
      <p><em>Last updated: {new Date().toISOString().slice(0,10)}</em></p>

      <h2>Service</h2>
      <p>
        AnalyticsAssistant.ai provides GA4 reporting insights. You remain responsible for your Google
        Analytics account and any actions you take based on insights.
      </p>

      <h2>Accounts & Access</h2>
      <p>
        You must have permission to connect the GA4 properties you access. You authorise us to retrieve
        read-only data on your behalf.
      </p>

      <h2>Subscriptions & Billing</h2>
      <p>
        Paid features are charged via Stripe. By upgrading, you agree to the price shown at checkout and to
        Stripe’s terms. You can manage or cancel your plan via the billing portal.
      </p>

      <h2>Acceptable Use</h2>
      <p>No illegal, abusive, or automated scraping use of the service.</p>

      <h2>Disclaimers</h2>
      <p>
        The service is provided “as is” without warranty. We are not liable for indirect or consequential
        loss. Our total liability is limited to fees paid for the last 3 months of service.
      </p>

      <h2>Contact</h2>
      <p>
        Email <a href="mailto:contact@analyticsassistant.ai">contact@analyticsassistant.ai</a>.
      </p>
    </main>
  );
}
