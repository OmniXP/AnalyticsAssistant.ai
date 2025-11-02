import { getServerSession } from "next-auth/next";
import type { GetServerSideProps } from "next";
import { authOptions } from "../lib/authOptions";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) {
    return { redirect: { destination: "/start", permanent: false } };
  }
  return { props: {} };
};

export default function InsightsPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Insights</h1>
      <p>Welcome. Your insights will appear here.</p>
    </div>
  );
}
