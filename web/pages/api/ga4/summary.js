// web/pages/api/ga4/summary.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function runReport(accessToken, property, dateRange) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      dateRanges: [dateRange],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }],
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GA4 runReport failed: ${r.status} ${txt}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) return res.status(401).json({ error: "Unauthorised" });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user?.ga4PropertyId) return res.status(400).json({ error: "No GA4 property selected" });

    const status = await (await fetch(process.env.NEXTAUTH_URL + "/api/auth/google/status", { cache: "no-store" })).json();
    if (!status.connected || !status.access_token) return res.status(401).json({ error: "GA4 not connected" });

    const at = status.access_token;

    const now = await runReport(at, user.ga4PropertyId, { startDate: "28daysAgo", endDate: "today" });
    const prev = await runReport(at, user.ga4PropertyId, { startDate: "56daysAgo", endDate: "29daysAgo" });

    const mv = (r, i) => Number(r?.rows?.[0]?.metricValues?.[i]?.value || 0);
    const sNow = mv(now, 0), uNow = mv(now, 1), cNow = mv(now, 2);
    const sPrev = mv(prev, 0), uPrev = mv(prev, 1), cPrev = mv(prev, 2);
    const pct = (a, b) => (b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

    res.json({
      property: user.ga4PropertyName || user.ga4PropertyId,
      period: "Last 28 days vs prior 28",
      metrics: {
        sessions: { value: sNow, changePct: pct(sNow, sPrev) },
        users: { value: uNow, changePct: pct(uNow, uPrev) },
        conversions: { value: cNow, changePct: pct(cNow, cPrev) },
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Summary failed", details: e.message });
  }
}
