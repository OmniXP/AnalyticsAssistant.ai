import { useMemo } from "react";

function StarterList({ hasRange, onStarter }) {
  const starters = useMemo(() => {
    if (hasRange) {
      return ["Summarise performance for this period", "Biggest revenue drivers?", "Where did conversions change?"];
    }
    return [
      "Review last 28 days",
      "What changed vs previous 28 days?",
      "Biggest revenue drivers?",
    ];
  }, [hasRange]);

  return (
    <div className="aa-chat-starters">
      {starters.map((starter) => (
        <button key={starter} type="button" className="aa-chat-starter" onClick={() => onStarter(starter)}>
          {starter}
        </button>
      ))}
    </div>
  );
}

export default function ChatPanel({
  open,
  onClose,
  messages,
  input,
  onInputChange,
  onSend,
  onStarter,
  onRetryDefaultRange,
  onUpgradeClick,
  loading,
  error,
  remainingQuota,
  freeLimit,
  rangeLabel,
  filterChips,
  listRef,
  locked,
  hasRange,
}) {
  if (!open) return null;

  const quotaLabel =
    typeof remainingQuota === "number"
      ? `${remainingQuota} of ${freeLimit} questions left this month`
      : null;

  const showStarters = messages.length === 0 && !loading;
  const errorCode = error?.code || null;

  return (
    <div className="aa-chat-panel aa-chat-panel--open" role="dialog" aria-label="Analytics Assistant chat">
      <div className="aa-chat-header">
        <div>
          <div className="aa-chat-title">Analytics Assistant</div>
          {quotaLabel ? <div className="aa-chat-quota">{quotaLabel}</div> : null}
        </div>
        <button type="button" className="aa-chat-close" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="aa-chat-meta">
        <span className="aa-chat-chip">{rangeLabel}</span>
        {filterChips.map((chip) => (
          <span key={chip} className="aa-chat-chip aa-chat-chip--muted">
            {chip}
          </span>
        ))}
      </div>

      <div className="aa-chat-body" ref={listRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`aa-chat-bubble ${msg.role === "user" ? "aa-chat-bubble--user" : "aa-chat-bubble--assistant"}`}
          >
            {msg.content}
          </div>
        ))}
        {loading ? (
          <div className="aa-chat-typing" aria-live="polite">
            <span className="aa-chat-typing__dot" />
            <span className="aa-chat-typing__dot" />
            <span className="aa-chat-typing__dot" />
          </div>
        ) : null}
        {showStarters ? <StarterList hasRange={hasRange} onStarter={onStarter} /> : null}
      </div>

      {error ? (
        <div className="aa-chat-error">
          <div className="aa-chat-error__message">{error.message}</div>
          {errorCode === "PROPERTY_REQUIRED" && error.fixUrl ? (
            <a className="aa-chat-cta" href={error.fixUrl} target="_blank" rel="noreferrer">
              Set GA4 property
            </a>
          ) : null}
          {errorCode === "AUTH_REQUIRED" && error.fixUrl ? (
            <a className="aa-chat-cta" href={error.fixUrl} target="_blank" rel="noreferrer">
              Sign in to continue
            </a>
          ) : null}
          {errorCode === "DATE_RANGE_LIMIT" ? (
            <button type="button" className="aa-chat-cta" onClick={onRetryDefaultRange}>
              Use last 28 days
            </button>
          ) : null}
          {errorCode === "PREMIUM_REQUIRED" ? (
            <button type="button" className="aa-chat-cta" onClick={() => onUpgradeClick(error.upgradeUrl)}>
              Upgrade to Premium
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="aa-chat-composer">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={locked ? "Upgrade to continue chatting." : "Ask about your GA4 performance…"}
          className="aa-chat-input"
          disabled={locked}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend(input);
            }
          }}
        />
        <button
          type="button"
          className="aa-chat-send"
          onClick={() => onSend(input)}
          disabled={locked || loading || !input.trim()}
        >
          {loading ? "…" : "Send"}
        </button>
      </div>

      <style jsx>{`
        .aa-chat-panel {
          position: fixed;
          right: 18px;
          bottom: 92px;
          width: min(420px, calc(100vw - 32px));
          height: min(640px, calc(100vh - 140px));
          background: var(--aa-color-surface);
          border: 1px solid var(--aa-color-border);
          border-radius: 18px;
          box-shadow: var(--aa-shadow-card);
          display: grid;
          grid-template-rows: auto auto 1fr auto auto;
          z-index: 60;
          opacity: 0;
          transform: translateY(12px);
          animation: aa-chat-panel-in 160ms ease-out forwards;
        }
        .aa-chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 16px 8px;
        }
        .aa-chat-title {
          font-weight: 700;
          color: var(--aa-color-ink);
        }
        .aa-chat-quota {
          font-size: 12px;
          color: var(--aa-color-muted);
        }
        .aa-chat-close {
          background: transparent;
          border: none;
          color: var(--aa-color-muted);
          cursor: pointer;
          font-size: 16px;
        }
        .aa-chat-meta {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          padding: 0 16px 8px;
        }
        .aa-chat-chip {
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          background: var(--aa-primary-soft);
          color: var(--aa-color-ink);
        }
        .aa-chat-chip--muted {
          background: var(--aa-color-surface-muted);
          color: var(--aa-color-muted);
        }
        .aa-chat-body {
          padding: 8px 16px 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .aa-chat-bubble {
          padding: 10px 12px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.45;
          max-width: 90%;
          white-space: pre-wrap;
        }
        .aa-chat-bubble--assistant {
          background: var(--aa-color-surface-muted);
          color: var(--aa-color-ink);
          align-self: flex-start;
        }
        .aa-chat-bubble--user {
          background: var(--aa-primary);
          color: white;
          align-self: flex-end;
        }
        .aa-chat-typing {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 0;
        }
        .aa-chat-typing__dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--aa-primary);
          opacity: 0.4;
          animation: aa-chat-bounce 1s ease-in-out infinite;
        }
        .aa-chat-typing__dot:nth-child(2) {
          animation-delay: 0.15s;
        }
        .aa-chat-typing__dot:nth-child(3) {
          animation-delay: 0.3s;
        }
        .aa-chat-starters {
          margin-top: 8px;
          display: grid;
          gap: 8px;
        }
        .aa-chat-starter {
          border: 1px dashed var(--aa-color-border);
          background: var(--aa-color-surface-muted);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 12px;
          text-align: left;
          cursor: pointer;
          color: var(--aa-color-ink);
        }
        .aa-chat-starter:hover {
          border-color: var(--aa-primary);
        }
        .aa-chat-error {
          margin: 8px 16px 0;
          padding: 10px 12px;
          border-radius: 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #7f1d1d;
          display: grid;
          gap: 8px;
          font-size: 12px;
        }
        .aa-chat-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--aa-primary);
          color: white;
          text-decoration: none;
          font-weight: 600;
          font-size: 12px;
          width: fit-content;
          border: none;
          cursor: pointer;
        }
        .aa-chat-composer {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          padding: 12px 16px 16px;
        }
        .aa-chat-input {
          resize: none;
          border-radius: 12px;
          border: 1px solid var(--aa-color-border);
          padding: 10px 12px;
          font-size: 13px;
          background: var(--aa-color-surface);
          color: var(--aa-color-ink);
        }
        .aa-chat-send {
          border: none;
          border-radius: 12px;
          padding: 10px 14px;
          background: var(--aa-primary);
          color: white;
          font-weight: 600;
          cursor: pointer;
        }
        .aa-chat-send:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 640px) {
          .aa-chat-panel {
            right: 12px;
            left: 12px;
            bottom: 88px;
            width: auto;
            height: min(85vh, 640px);
          }
        }
        @keyframes aa-chat-panel-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes aa-chat-bounce {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-3px);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .aa-chat-panel {
            animation: none;
            opacity: 1;
            transform: none;
          }
          .aa-chat-typing__dot {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
