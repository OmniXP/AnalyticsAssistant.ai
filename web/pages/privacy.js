// web/pages/privacy.js
export default function Privacy() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "40px auto",
        padding: "0 20px",
        lineHeight: 1.6,
      }}
    >
      <h1>Privacy Policy – AnalyticsAssistant.ai</h1>
      <p>
        <em>Last updated: {today}</em>
      </p>

      <h2>Overview</h2>
      <p>
        AnalyticsAssistant.ai connects to your Google Analytics 4 (GA4) account with your
        permission to read reporting data. We request the minimum scopes needed to provide
        our service (including <code>analytics.readonly</code>) and we never modify your
        Analytics properties or data.
      </p>

      <h2>Data Accessed from Google</h2>
      <p>
        AnalyticsAssistant.ai uses Google APIs to access the following Google user data:
      </p>

      <h3>Google account information</h3>
      <ul>
        <li>Email address</li>
        <li>OpenID identifier</li>
      </ul>
      <p>
        Used to authenticate the user and link their AnalyticsAssistant account and
        subscription to the correct Google account.
      </p>

      <h3>Google Analytics 4 reporting data</h3>
      <ul>
        <li>
          Aggregated metrics such as sessions, users, conversions, revenue and other
          standard GA4 metrics.
        </li>
        <li>
          Aggregated dimensions such as date, channel group, source / medium, campaign,
          landing page, product, device, country.
        </li>
      </ul>
      <p>
        AnalyticsAssistant.ai does not modify your GA4 property or other Google products.
        We use the <code>analytics.readonly</code> scope only to read reporting data.
      </p>

      <h3>OAuth tokens</h3>
      <ul>
        <li>
          Access and refresh tokens issued by Google to call the Analytics Data API on
          behalf of the user.
        </li>
      </ul>

      <h2>How We Use Google User Data</h2>
      <p>We use the Google user data described above for the following purposes:</p>
      <ul>
        <li>
          To authenticate users and associate their GA4 connection and subscription with
          the correct AnalyticsAssistant account.
        </li>
        <li>
          To request GA4 reporting data in order to:
          <ul>
            <li>
              Display dashboards and reports inside the AnalyticsAssistant application.
            </li>
            <li>
              Generate automated, plain‑English summaries and recommendations about
              website and campaign performance.
            </li>
          </ul>
        </li>
        <li>
          To maintain secure, authorised access to GA4 on behalf of the user via OAuth
          tokens.
        </li>
      </ul>

      <p>We do not use Google user data for:</p>
      <ul>
        <li>Advertising or marketing our own products to other users.</li>
        <li>Building or selling aggregated profiles of end‑users.</li>
        <li>Training generalized or public machine learning models.</li>
      </ul>
      <p>
        Any use of Google user data is strictly limited to providing and improving the
        AnalyticsAssistant service to the user who granted access.
      </p>

      <h2>Sharing of Google User Data</h2>
      <p>We do not sell Google user data.</p>
      <p>
        We may share or process Google user data with the following categories of service
        providers, solely as data processors:
      </p>
      <ul>
        <li>
          <strong>Hosting and infrastructure providers</strong> (e.g. Vercel, database and
          key‑value store providers) — to host our application, store configuration and
          OAuth tokens, and operate the service.
        </li>
        <li>
          <strong>Analytics and error‑monitoring tools</strong> — to monitor the health
          and performance of the application, using de‑identified or minimal data where
          possible.
        </li>
        <li>
          <strong>AI model provider</strong> (e.g. OpenAI) — when a user explicitly
          requests an AI summary, we send aggregated GA4 report data for that request (for
          example, per‑channel metrics). This data is used only to generate the requested
          summary and is not used to train or improve public models.
        </li>
      </ul>
      <p>
        All such providers are bound by contractual obligations to use the data only to
        provide services to AnalyticsAssistant and to protect it in accordance with
        applicable data‑protection laws.
      </p>
      <p>
        We may also disclose information if required by law, regulation, or legal process,
        or to protect our rights, users, or the public.
      </p>

      <h2>Data Storage &amp; Protection</h2>
      <ul>
        <li>
          OAuth access and refresh tokens are stored only on our backend in secure,
          access‑controlled storage. They are never stored in the browser or exposed to
          front‑end JavaScript.
        </li>
        <li>
          Session cookies are HttpOnly and scoped to our domain.
        </li>
        <li>
          Our infrastructure providers store data in secure data centers with
          industry‑standard physical and technical safeguards.
        </li>
        <li>
          Access to production systems is restricted to authorised personnel with a
          legitimate need and is logged.
        </li>
      </ul>
      <p>
        We implement appropriate technical and organisational measures to protect against
        unauthorised access, disclosure, alteration or destruction of data.
      </p>

      <h2>Data Retention &amp; Deletion</h2>
      <p>
        We retain Google user data (including GA4 connection configuration and OAuth
        tokens) for as long as:
      </p>
      <ul>
        <li>The user’s AnalyticsAssistant account remains active; and</li>
        <li>The connection to their GA4 property is enabled.</li>
      </ul>
      <p>
        If a user disconnects Google Analytics within the application, we delete the
        associated OAuth tokens from storage and stop requesting data for that property.
      </p>
      <p>
        If a user closes their AnalyticsAssistant account or requests deletion, we delete
        their account, associated OAuth tokens and configuration, subject to minimal
        retention needed for legal, security or accounting purposes (for example, billing
        records).
      </p>
      <p>
        Users may revoke AnalyticsAssistant’s access to their Google account at any time
        via the Google Account permissions page. Once revoked, we can no longer access new
        GA4 data on their behalf.
      </p>
      <p>
        Users can request deletion of their account and associated data at any time by
        emailing{" "}
        <a href="mailto:support@analyticsassistant.ai">
          support@analyticsassistant.ai
        </a>{" "}
        or via the in‑app account settings page (when available).
      </p>

      <h2>Compliance with Google API Services User Data Policy</h2>
      <p>
        AnalyticsAssistant.ai’s use of information received from Google APIs will adhere
        to the Google API Services User Data Policy, including the Limited Use
        requirements.
      </p>
    </main>
  );
}