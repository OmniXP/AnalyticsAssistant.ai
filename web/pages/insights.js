import { getServerSession } from "next-auth/next";
import { authOptions } from "../lib/authOptions";

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) {
    return { redirect: { destination: "/start", permanent: false } };
  }
  return { props: {} };
}

export default function InsightsPage() {
  const isSuccess =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";

  return (
    <div style={{ padding: 24 }}>
      {isSuccess && (
        <div
          style={{
            background: "#e6ffed",
            border: "1px solid #b7eb8f",
            padding: 12,
            marginBottom: 12,
            borderRadius: 6,
          }}
        >
          Payment successful — Pro unlocked.
        </div>
      )}

      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Insights</h1>
      <p>Welcome. Your insights will appear here.</p>
    </div>
  );
}
