// /workspaces/insightsgpt/web/pages/_app.js
import React from "react";

function ErrorFallback({ error, reset }) {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <h2>Something went wrong</h2>
      <p style={{ whiteSpace: "pre-wrap", color: "#a00" }}>{String(error)}</p>
      <button onClick={reset} style={{ padding: "8px 12px", cursor: "pointer" }}>
        Reload app
      </button>
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // You can wire this to Sentry/console if you want
    // eslint-disable-next-line no-console
    console.error("App crashed:", error, info);
  }
  reset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") {
      // Worst-case: corrupted localStorage can crash during parse
      try {
        // no-op
      } catch {}
      window.location.reload();
    }
  };
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

export default function MyApp({ Component, pageProps }) {
  return (
    <AppErrorBoundary>
      <Component {...pageProps} />
    </AppErrorBoundary>
  );
}
