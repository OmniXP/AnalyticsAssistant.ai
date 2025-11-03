// web/pages/admin/users.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) return { redirect: { destination: "/start", permanent: false } };

  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(session.user.email.toLowerCase())) {
    return { redirect: { destination: "/start", permanent: false } };
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      premium: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubId: true,
      ga4PropertyName: true,
      createdAt: true,
    },
  });

  return { props: { users: JSON.parse(JSON.stringify(users)) } };
}

export default function AdminUsers({ users }) {
  return (
    <main style={{ maxWidth: 920, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Users</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Email</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Premium</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Plan</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>GA4</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={{ padding: 6 }}>{u.email}</td>
              <td style={{ padding: 6 }}>{u.premium ? "Yes" : "No"}</td>
              <td style={{ padding: 6 }}>{u.plan || "-"}</td>
              <td style={{ padding: 6 }}>{u.ga4PropertyName || "-"}</td>
              <td style={{ padding: 6 }}>{new Date(u.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
