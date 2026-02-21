// web/components/ChatgptOnboardingShell.js
// Shared branded shell for ChatGPT onboarding flows
import Image from "next/image";
import Link from "next/link";

export default function ChatgptOnboardingShell({ children, showNav = true }) {
  return (
    <div className="aa-start">
      {showNav && (
        <header className="aa-nav">
          <div className="aa-nav__inner">
            <div className="aa-nav__logo">
              <Image
                src="/header-logo.png"
                alt="AnalyticsAssistant"
                width={2415}
                height={207}
                priority
                style={{ height: 20, width: "auto" }}
              />
            </div>
          </div>
        </header>
      )}
      <div className="aa-shell">
        {children}
      </div>
      <footer className="aa-footer">
        <div className="aa-footer__brand">
          <span>Read-only, Google-verified connection to your GA4 data.</span>
          <span className="aa-footer__divider">•</span>
          <Link href="/premium">Premium</Link>
          <span className="aa-footer__divider">•</span>
          <a href="https://www.analyticsassistant.ai" target="_blank" rel="noopener noreferrer">
            About
          </a>
          <span className="aa-footer__divider">•</span>
          <Link href="/privacy">Privacy Policy</Link>
          <span className="aa-footer__divider">•</span>
          <Link href="/terms">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}
