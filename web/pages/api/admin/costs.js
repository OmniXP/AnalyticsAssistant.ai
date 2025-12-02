// web/pages/api/admin/costs.js
// API endpoint to fetch real-time cost data
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../lib/authOptions";
import { getAggregatedUsage, calculateCosts, cacheCosts, getCachedCosts } from "../../../lib/server/cost-tracking.js";

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check admin access
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const adminEmails = parseAdminEmails();
  const email = session.user?.email?.toLowerCase() || "";
  if (!adminEmails.includes(email)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const forceRefresh = req.query.refresh === "true";
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedCosts();
      if (cached && cached.timestamp) {
        const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
        // Use cache if less than 1 hour old
        if (cacheAge < 60 * 60 * 1000) {
          return res.status(200).json(cached);
        }
      }
    }

    // Fetch fresh data
    const usage = await getAggregatedUsage();
    const costs = calculateCosts(usage);
    
    // Cache the results
    await cacheCosts(usage, costs);

    return res.status(200).json({
      usage,
      costs,
      period: usage.period,
      timestamp: usage.timestamp,
    });
  } catch (error) {
    console.error("[admin/costs] Error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch cost data" });
  }
}

