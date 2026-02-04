import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "../../lib/analytics";
import ChatPanel from "./ChatPanel";
import SwirlLauncher from "./SwirlLauncher";

const FREE_CHAT_LIMIT = 5;

function normalizeFilters(filters) {
  return {
    country: filters?.country || "All",
    channelGroup: filters?.channelGroup || "All",
    deviceType: filters?.deviceType || "All",
  };
}

function buildRangeLabel(startDate, endDate) {
  if (startDate && endDate) return `${startDate} → ${endDate}`;
  return "Last 28 days";
}

function buildFilterChips(filters) {
  const chips = [];
  if (filters.country && filters.country !== "All") chips.push(`Country: ${filters.country}`);
  if (filters.channelGroup && filters.channelGroup !== "All") chips.push(`Channel: ${filters.channelGroup}`);
  if (filters.deviceType && filters.deviceType !== "All") chips.push(`Device: ${filters.deviceType}`);
  if (!chips.length) chips.push("All traffic");
  return chips;
}

export default function ChatWidget({ propertyId, startDate, endDate, filters }) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remainingQuota, setRemainingQuota] = useState(null);
  const [locked, setLocked] = useState(false);
  const listRef = useRef(null);
  const lastPromptRef = useRef("");

  const safeFilters = useMemo(() => normalizeFilters(filters), [filters]);
  const hasRange = Boolean(startDate && endDate);
  const rangeLabel = useMemo(() => buildRangeLabel(startDate, endDate), [startDate, endDate]);
  const filterChips = useMemo(() => buildFilterChips(safeFilters), [safeFilters]);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  const handleSend = async (text, { intent, forceDefaultRange } = {}) => {
    const trimmed = String(text || "").trim();
    if (!trimmed || loading || locked) return;
    setError(null);
    setLoading(true);
    setInput("");
    lastPromptRef.current = trimmed;

    const userMessage = { id: `u_${Date.now()}`, role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    try {
      trackEvent("message_sent", { source: "chat_widget", hasRange });
    } catch {}

    const payload = {
      threadId,
      message: trimmed,
      propertyId,
      dateRange: !forceDefaultRange && hasRange ? { startDate, endDate } : null,
      filters: safeFilters,
      intent: intent || "default",
    };

    try {
      const res = await fetch("/api/insights/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data?.code || data?.error || "CHAT_ERROR";
        const message = data?.message || data?.error || "Chat failed.";
        setError({
          code,
          message,
          fixUrl: data?.fixUrl,
          upgradeUrl: data?.upgradeUrl,
        });
        if (code === "PREMIUM_REQUIRED") {
          setLocked(true);
        }
        return;
      }

      if (data?.threadId) setThreadId(data.threadId);
      if (typeof data?.remainingQuota === "number") {
        setRemainingQuota(data.remainingQuota);
      }

      const assistantMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data?.assistantMessage || "I couldn't generate a response. Try again?",
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError({
        code: "CHAT_ERROR",
        message: err?.message || "Chat failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStarter = (text) => {
    try {
      trackEvent("starter_clicked", { source: "chat_widget", label: text });
    } catch {}
    handleSend(text, { intent: "starter" });
  };

  const handleRetryDefaultRange = () => {
    if (!lastPromptRef.current) return;
    setError(null);
    handleSend(lastPromptRef.current, { intent: "default", forceDefaultRange: true });
  };

  const handleUpgradeClick = (url) => {
    try {
      trackEvent("upgrade_cta_clicked", { source: "chat_widget" });
    } catch {}
    const target = url || "/premium";
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <>
      <SwirlLauncher
        isOpen={open}
        hasMessages={hasMessages}
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) {
              try {
                trackEvent("launcher_opened", { source: "chat_widget" });
              } catch {}
            }
            return next;
          });
        }}
      />
      <ChatPanel
        open={open}
        onClose={() => setOpen(false)}
        messages={messages}
        input={input}
        onInputChange={setInput}
        onSend={handleSend}
        onStarter={handleStarter}
        onRetryDefaultRange={handleRetryDefaultRange}
        onUpgradeClick={handleUpgradeClick}
        onReload={handleReload}
        loading={loading}
        error={error}
        remainingQuota={remainingQuota}
        freeLimit={FREE_CHAT_LIMIT}
        rangeLabel={rangeLabel}
        filterChips={filterChips}
        listRef={listRef}
        locked={locked}
        hasRange={hasRange}
      />
    </>
  );
}
