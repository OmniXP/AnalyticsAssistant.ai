// web/pages/admin/users.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/authOptions";
import { PrismaClient } from "@prisma/client";
import { useMemo, useState } from "react";
import Link from "next/link";

const prisma = new PrismaClient();

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function getServerSideProps(ctx) {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session) return { redirect: { destination: "/start", permanent: false } };

  const adminEmails = parseAdminEmails();
  const email = session.user?.email?.toLowerCase?.() || "";
  const isAdmin = adminEmails.includes(email);

  if (!isAdmin) {
    return {
      props: {
        unauthorized: true,
        configuredAdmins: adminEmails,
        sessionEmail: session.user?.email || null,
      },
    };
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

  return { props: { users: JSON.parse(JSON.stringify(users)), unauthorized: false } };
}

export default function AdminUsers({ users = [], unauthorized = false, configuredAdmins = [], sessionEmail = null }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return users;
    return users.filter((u) => {
      const fields = [
        u.email?.toLowerCase?.() || "",
        u.plan?.toLowerCase?.() || "",
        u.ga4PropertyName?.toLowerCase?.() || "",
      ];
      return fields.some((value) => value.includes(normalized));
    });
  }, [normalized, users]);

  if (unauthorized) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Admin access required</h1>
        <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
          You&apos;re signed in as <strong>{sessionEmail || "unknown user"}</strong>, but this page is limited to admin
          accounts only.
        </p>
        <p style={{ color: "#4b5563", lineHeight: 1.5 }}>
          To enable access, set the <code>ADMIN_EMAILS</code> environment variable (comma-separated list) in Vercel →
          Project Settings → Environment Variables, then redeploy. Include the exact Google account email you sign in with.
        </p>
        <div style={{ margin: "16px 0", padding: 12, borderRadius: 12, background: "#f1f5f9", color: "#475569" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Currently configured admins</div>
          {configuredAdmins.length === 0 ? (
            <div>No admin emails configured yet.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {configuredAdmins.map((email) => (
                <li key={email}>{email}</li>
              ))}
            </ul>
          )}
        </div>
        <Link href="/" style={{ color: "#2563EB", fontWeight: 600 }}>
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 920, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Users</h1>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by email, plan, or property"
          style={{
            flex: "1 1 260px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
          }}
        />
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          Showing {filtered.length} of {users.length}
        </span>
      </div>

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
          {filtered.map((u) => (
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
