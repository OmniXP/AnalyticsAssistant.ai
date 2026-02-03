export default function SwirlLauncher({ onClick, isOpen, hasMessages }) {
  return (
    <>
      <button
        type="button"
        className={`aa-chat-launcher ${isOpen ? "aa-chat-launcher--open" : ""} ${!isOpen && !hasMessages ? "aa-chat-launcher--idle" : ""}`}
        onClick={onClick}
        aria-label="Open Analytics Chat"
      >
        <span className="aa-chat-launcher__ring" aria-hidden />
        <span className="aa-chat-launcher__core">
          <span className="aa-chat-launcher__label">AI</span>
        </span>
      </button>
      <style jsx>{`
        .aa-chat-launcher {
          position: fixed;
          right: 18px;
          bottom: 84px;
          width: 58px;
          height: 58px;
          border: none;
          border-radius: 999px;
          background: transparent;
          padding: 0;
          cursor: pointer;
          z-index: 61;
        }
        .aa-chat-launcher__ring {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: conic-gradient(
            from 0deg,
            var(--aa-primary),
            rgba(0, 0, 0, 0) 25%,
            var(--aa-primary) 50%,
            rgba(0, 0, 0, 0) 75%,
            var(--aa-primary)
          );
          mask: radial-gradient(transparent calc(100% - 6px), #000 calc(100% - 5px));
          animation: aa-chat-spin 6s linear infinite;
          box-shadow: 0 10px 25px rgba(24, 62, 255, 0.2);
        }
        .aa-chat-launcher__core {
          position: absolute;
          inset: 6px;
          border-radius: 999px;
          background: var(--aa-color-surface);
          border: 1px solid var(--aa-color-border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: var(--aa-primary);
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.15);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }
        .aa-chat-launcher__label {
          font-size: 14px;
          letter-spacing: 0.5px;
        }
        .aa-chat-launcher:focus-visible {
          outline: 3px solid var(--aa-primary);
          outline-offset: 3px;
        }
        .aa-chat-launcher:hover .aa-chat-launcher__core {
          transform: scale(1.02);
        }
        .aa-chat-launcher:hover .aa-chat-launcher__ring {
          box-shadow: 0 12px 30px rgba(24, 62, 255, 0.28);
          animation: aa-chat-spin 6s linear infinite, aa-chat-pulse 1.6s ease-in-out infinite;
        }
        .aa-chat-launcher--idle .aa-chat-launcher__ring {
          box-shadow: 0 14px 34px rgba(24, 62, 255, 0.38);
        }
        .aa-chat-launcher--idle .aa-chat-launcher__core {
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.2);
        }
        @keyframes aa-chat-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes aa-chat-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.04);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .aa-chat-launcher__ring {
            animation: none;
          }
        }
        @media (max-width: 640px) {
          .aa-chat-launcher {
            right: 14px;
            bottom: 74px;
          }
        }
      `}</style>
    </>
  );
}
