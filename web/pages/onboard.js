// web/pages/onboard.js
// Simple onboarding page with one-click GA4 connection

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import ConnectGA4Button from "../components/ConnectGA4Button";

const CHATGPT_GPT_URL = process.env.NEXT_PUBLIC_CHATGPT_GPT_URL || "https://chat.openai.com";

export default function OnboardPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const isChatGPTSource = router.query.source === "chatgpt";

  // Check if GA4 is already connected
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/google/status", { cache: "no-store" });
        const data = await res.json();
        if (data?.hasTokens && !data?.expired) {
          setConnected(true);
          // For non-ChatGPT flows, redirect to dashboard after a short delay
          if (!isChatGPTSource) {
          setTimeout(() => {
              router.push("/?connected=true");
          }, 1500);
          }
        }
      } catch (e) {
        console.error("Status check error:", e);
      } finally {
        setChecking(false);
      }
    })();
  }, [router, isChatGPTSource]);

  // Handle connected query param (from OAuth callback)
  useEffect(() => {
    if (router.query.connected === "true") {
      setConnected(true);
      // For non-ChatGPT flows, redirect to dashboard after showing success message
      if (!isChatGPTSource) {
      setTimeout(() => {
          router.push("/?connected=true");
      }, 2000);
      }
    }
  }, [router.query.connected, router, isChatGPTSource]);

  if (checking) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-600">Checking connection...</p>
      </main>
    );
  }

  if (connected) {
    // For ChatGPT users, redirect to property selection instead of showing Return to ChatGPT
    if (isChatGPTSource) {
      const nextParam = router.query.next ? `&next=${encodeURIComponent(router.query.next)}` : "";
      router.replace(`/onboarding/select-property?source=chatgpt${nextParam}`);
      return (
        <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-600">Next: select your default GA4 property...</p>
        </main>
      );
    }
    return (
      <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-green-600 text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">GA4 Connected Successfully</h1>
        <p className="text-gray-600 mb-4">Fetching your latest insights...</p>
        <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-3xl font-bold mb-2">
        {isChatGPTSource ? "Connect GA4 for ChatGPT" : "AnalyticsAssistant.ai"}
      </h1>
      <p className="text-gray-600 max-w-md mb-8">
        {isChatGPTSource
          ? "Connect your Google Analytics 4 once below — then I’ll use it in ChatGPT to pull fresh insights and explain what changed, why, and what to do next."
          : "Connect your Google Analytics 4 once below — I'll automatically pull your latest insights and show you what changed, why, and what to do next."}
      </p>

      <ConnectGA4Button
        redirectPath={
          isChatGPTSource
            ? `/onboarding/select-property?source=chatgpt${router.query.next ? `&next=${encodeURIComponent(router.query.next)}` : ""}`
            : "/onboard?connected=true"
        }
      />

      <footer className="mt-10 text-sm text-gray-400">
        Secure OAuth 2.0 connection • Read-only access • No data stored beyond metrics
      </footer>
    </main>
  );
}
