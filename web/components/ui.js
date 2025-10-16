// components/ui.js
/* eslint-disable @next/next/no-img-element */
import React from "react";

export function Card({ children, style, className = "" }) {
  const base = {
    padding: 16,
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "saturate(180%) blur(12px)",
    WebkitBackdropFilter: "saturate(180%) blur(12px)",
    border: "1px solid rgba(17, 24, 39, 0.08)",
    borderRadius: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  };
  return (
    <section className={`card ${className}`} style={{ ...base, ...(style || {}) }}>
      {children}
    </section>
  );
}

export function SectionHeader({ title, children, style }) {
  return (
    <div
      className="section-head"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 4px",
        ...(style || {}),
      }}
    >
      <h3 style={{ margin: 0 }}>{title}</h3>
      <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export function Button({ variant = "default", disabled, style, children, ...rest }) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(17, 24, 39, 0.08)",
    borderRadius: 9999,
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer",
    background: "#fff",
    transition: "transform .04s ease, box-shadow .2s ease, background .2s ease",
  };
  const variants = {
    default: { color: "#0f172a", background: "#fff" },
    primary: { color: "#fff", background: "#4285F4", border: "1px solid transparent" },
    danger: { color: "#fff", background: "#EA4335", border: "1px solid transparent" },
    ghost: { color: "#0f172a", background: "transparent" },
  };
  const hover = variant === "primary" ? { background: "#2b74f3" } : variant === "danger" ? { background: "#d03428" } : {};
  return (
    <button
      disabled={disabled}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
      style={{ ...base, ...(variants[variant] || {}), ...(style || {}), ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}) }}
      {...rest}
      onMouseEnter={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, hover);
      }}
      onFocus={(e) => {
        if (!disabled) Object.assign(e.currentTarget.style, hover);
      }}
    >
      {children}
    </button>
  );
}

export function TrendPill({ delta = 0, prefix = "", suffix = "%" }) {
  const up = Number(delta) > 0;
  const down = Number(delta) < 0;
  const color = up ? "#34A853" : down ? "#EA4335" : "#64748b";
  const sign = up ? "+" : down ? "" : "";
  return (
    <span
      className="pill"
      title="Change vs previous"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 9999,
        border: "1px solid rgba(17, 24, 39, 0.08)",
        background: "#fff",
        fontSize: 12,
        color,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      {`${prefix}${sign}${delta}${suffix}`}
    </span>
  );
}
