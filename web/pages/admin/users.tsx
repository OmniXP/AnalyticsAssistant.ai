import { getServerSession } from "next-auth/next";
import type { GetServerSideProps } from "next";
import { authOptions } from "../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const adminList = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (!session?.user?.email || !adminList.includes(session.user.email)) {
    return { redirect: { destination: "/start", permanent: false } };
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { email: true, name: true, createdAt: true, image: true },
  });

  return { props: { users: users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })) } };
};

export default function AdminUsers({ users }: { users: { email: string; name?: string | null; createdAt: string }[] }) {
  return (
    <div style={{ maxWidth: 800, margin: "24px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Users</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Email</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Name</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>Signed up</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.email}>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.email}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.name || "—"}</td>
              <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{u.createdAt.slice(0,10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
