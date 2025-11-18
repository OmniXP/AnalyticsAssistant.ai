import { withPremiumGuard } from "../../../server/usage-limits.js";

// Minimal Slack Performance Digest sender (supports "test" mode).
// Expects POST with a Slack Incoming Webhook URL.

async function handler(req, res) {
  // Allow only POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const { test = false, slackWebhook = "", propertyId = "", dateRange = { start: "", end: "" }, filters = {}, summary = "" } =
      req.body || {};

    // --- Validate webhook
    if (!/^https:\/\/hooks\.slack\.com\/services\//.test(slackWebhook || "")) {
      return res.status(400).json({ error: "missing_or_invalid_webhook" });
    }

    // --- Basic validation
    if (!propertyId) {
      return res.status(400).json({ error: "missing_property_id" });
    }
    const start = dateRange?.start || "";
    const end = dateRange?.end || "";
    if (!start || !end) {
      return res.status(400).json({ error: "missing_date_range" });
    }

    // Compose the message
    let text;
    if (test) {
      text = [
        `*Performance Digest (Test)*`,
        `Property: ${propertyId}`,
        `Range: ${start} → ${end}`,
        filters && (filters.country || filters.channelGroup)
          ? `Filters: ${(filters.country && filters.country !== "All" ? `Country=${filters.country}` : "")}${
              filters.country && filters.channelGroup && filters.channelGroup !== "All" ? " · " : ""
            }${filters.channelGroup && filters.channelGroup !== "All" ? `Channel=${filters.channelGroup}` : ""}`
          : "",
        "",
        "_This is a test ping from the digest API route._",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      // Real digest — if a summary wasn't provided, send a helpful minimal message
      const safeSummary = String(summary || "").trim();
      text = [
        `*Performance Digest*`,
        `Property: ${propertyId}`,
        `Range: ${start} → ${end}`,
        filters && (filters.country || filters.channelGroup)
          ? `Filters: ${(filters.country && filters.country !== "All" ? `Country=${filters.country}` : "")}${
              filters.country && filters.channelGroup && filters.channelGroup !== "All" ? " · " : ""
            }${filters.channelGroup && filters.channelGroup !== "All" ? `Channel=${filters.channelGroup}` : ""}`
          : "",
        "",
        safeSummary || "_No AI summary provided from client. Consider calling /api/insights/summarise-pro first and pass the text here._",
      ]
        .filter(Boolean)
        .join("\n");
    }

    // Slack payload (simple text)
    const payload = { text };

    // Send to Slack
    const r = await fetch(slackWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(502).json({ error: "slack_post_failed", status: r.status, body: t.slice(0, 500) });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("slack/digest error", err);
    return res.status(500).json({ error: "server_error" });
  }
}

export default withPremiumGuard(handler, { methods: ["POST"] });
