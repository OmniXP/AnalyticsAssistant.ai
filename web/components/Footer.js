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
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: "#6b7280", fontSize: 14 }}>
          Read-only, Google-verified connection to your GA4 data.
        </span>
        <span style={{ color: "#9ca3af", fontSize: 14 }}>•</span>
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
        <Link
          href="/privacy"
          style={{
            color: "#6b7280",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          Privacy Policy
        </Link>
        <span style={{ color: "#9ca3af", fontSize: 14 }}>•</span>
        <Link
          href="/terms"
          style={{
            color: "#6b7280",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}

