// web/pages/api/ga4/query.js
// GA4 query that does NOT depend on NextAuth. It uses the GA cookie (aa_auth).
// You can pass { "property": "properties/123456789", ... } in the POST body as a fallback.

import { PrismaClient } from "@prisma/client";
const { getAccessTokenFromRequest } = require("../../../server/ga4-session");

const prisma = new PrismaClient();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    // 1) Get Google access token from GA cookie
    const accessToken = await getAccessTokenFromRequest(req);
    if (!accessToken) {
      return res.status(401).json({
        error:
          'Google session expired or missing. Click "Connect Google Analytics" to re-authorise, then run again.',
      });
    }

    // 2) Determine GA4 property
    // 2a) Try NextAuth -> DB (non-fatal if missing)
    let property = null;
    let propertyName = null;
    try {
      const { getServerSession } = await import("next-auth/next");
      const { authOptions } = await import("../../../lib/authOptions");
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { ga4PropertyId: true, ga4PropertyName: true },
        });
        if (user?.ga4PropertyId) {
          property = user.ga4PropertyId;
          propertyName = user.ga4PropertyName || null;
        }
      }
    } catch {
      // ignore NextAuth errors
    }

    // 2b) Allow explicit override in body
    let body = {};
    try {
      body = req.body && typeof req.body === "object" ? req.body : {};
    } catch {
      body = {};
    }
    if (!property && typeof body.property === "string" && body.property.startsWith("properties/")) {
      property = body.property;
    }

    if (!property) {
      return res.status(400).json({ error: "No GA4 property selected or provided" });
    }

    // 3) Build request payload (fallback defaults)
    const dateRanges =
      Array.isArray(body.dateRanges) && body.dateRanges.length
        ? body.dateRanges
        : [{ startDate: "28daysAgo", endDate: "today" }];

    const metrics =
      Array.isArray(body.metrics) && body.metrics.length
        ? body.metrics
        : [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }];

    const dimensions = Array.isArray(body.dimensions) ? body.dimensions : [];

    const requestPayload = { dateRanges, metrics, dimensions };

    // 4) Call GA4 Data API
    const r = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`,
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
      return res.status(r.status).json({
        error: `GA4 runReport failed: ${r.status}`,
        details: txt,
      });
    }

    const data = await r.json();
    return res.json({
      property: propertyName || property,
      request: requestPayload,
      report: data,
    });
  } catch (e) {
    console.error("GA4 query error:", e);
    return res.status(500).json({ error: "GA4 query failed", details: e.message });
  }
}
