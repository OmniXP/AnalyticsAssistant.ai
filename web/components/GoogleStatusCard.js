// web/components/GoogleStatusCard.js
import { useEffect, useState } from "react";

export default function GoogleStatusCard() {
  const [state, setState] = useState({ loading: true, hasTokens: false, expired: true });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/google/status", { cache: "no-store" });
        const j = await r.json();
        setState({ loading: false, hasTokens: !!j.hasTokens, expired: !!j.expired });
      } catch {
        setState({ loading: false, hasTokens: false, expired: true });
      }
    })();
  }, []);

  let colour = "#999", text = "Checking…";
  if (!state.loading) {
    if (state.hasTokens && !state.expired) {
      colour = "#137333";
      text = "Connected to Google Analytics";
    } else if (state.hasTokens && state.expired) {
      colour = "#b80606";
      text = "Google token expired, re-authorise";
    } else {
      colour = "#b80606";
      text = "Not connected";
    }
  }

  return (
    <div style={{ border: `1px solid ${colour}`, borderRadius: 8, padding: 12 }}>
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: 999,
          background: colour,
          marginRight: 8,
          verticalAlign: "middle",
        }}
      />
      <span style={{ color: colour, fontWeight: 600 }}>{text}</span>
    </div>
  );
}
