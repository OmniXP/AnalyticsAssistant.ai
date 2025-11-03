// web/pages/api/ga4/query.js
// Generic GA4 query endpoint that is both app-authenticated (NextAuth)
// and Google-authenticated (reads GA session cookie and fetches a fresh access token).

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";
import { PrismaClient } from "@prisma/client";

// Use the same Node helper that reads the cookie and gets/refreshes the token
const { getAccessTokenFromRequest } = require("../../../server/ga4-session");

const prisma = new PrismaClient();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // 1) Must be signed in to the app
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorised (app session missing)" });
    }

    // 2) Must have selected a GA4 property
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { ga4PropertyId: true, ga4PropertyName: true },
    });
    if (!user?.ga4PropertyId) {
      return res.status(400).json({ error: "No GA4 property selected" });
    }

    // 3) Get Google access token tied to this browser session (from cookie)
    const accessToken = await getAccessTokenFromRequest(req);
    if (!accessToken) {
      return res.status(401).json({
        error:
          'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then run again.',
      });
    }

    // 4) Build the GA4 request body (sane defaults if none provided)
    let body = {};
    try {
      body = req.body && typeof req.body === "object" ? req.body : {};
    } catch {
      body = {};
    }

    const dateRanges = Array.isArray(body.dateRanges) && body.dateRanges.length
      ? body.dateRanges
      : [{ startDate: "28daysAgo", endDate: "today" }];

    const metrics = Array.isArray(body.metrics) && body.metrics.length
      ? body.metrics
      : [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }];

    const dimensions = Array.isArray(body.dimensions) ? body.dimensions : [];

    const requestPayload = {
      dateRanges,
      metrics,
      dimensions,
      // You can pass orderBys, limit, etc. in the POST body if needed
    };

    // 5) Call GA4 Data API
    const r = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${user.ga4PropertyId}:runReport`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestPayload),
      }
    );

    if (!r.ok) {
      const txt = await r.text();
      return res
        .status(r.status)
        .json({ error: `GA4 runReport failed: ${r.status}`, details: txt });
    }

    const data = await r.json();
    return res.json({
      property: user.ga4PropertyName || user.ga4PropertyId,
      request: requestPayload,
      report: data,
    });
  } catch (e) {
    console.error("GA4 query error:", e);
    return res.status(500).json({ error: "GA4 query failed", details: e.message });
  }
}
