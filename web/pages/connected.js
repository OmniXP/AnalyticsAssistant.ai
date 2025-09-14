// /workspaces/insightsgpt/web/pages/connected.js
import Link from "next/link";

export default function Connected() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Connected ✅</h1>
      <p>You’re connected to Google Analytics. Go back to the home page to run a report.</p>
      <p>
        <Link href="/">← Back to Home</Link>
      </p>
    </main>
  );
}
