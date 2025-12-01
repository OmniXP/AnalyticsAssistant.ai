// web/components/Footer.js
import Link from "next/link";

export default function Footer() {
  return (
    <footer
      style={{
        marginTop: "auto",
        padding: "24px 16px",
        borderTop: "1px solid #e5e7eb",
        background: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/premium"
          style={{
            color: "#4f46e5",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          Premium
        </Link>
        <span style={{ color: "#9ca3af", fontSize: 14 }}>•</span>
        <a
          href="https://www.analyticsassistant.ai"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#6b7280",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          About
        </a>
        <span style={{ color: "#9ca3af", fontSize: 14 }}>•</span>
        <a
          href="mailto:contact@analyticsassistant.ai"
          style={{
            color: "#6b7280",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          Contact
        </a>
      </div>
    </footer>
  );
}

