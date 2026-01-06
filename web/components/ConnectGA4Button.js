// web/components/ConnectGA4Button.js
import { useState } from "react";

export default function ConnectGA4Button({ redirectPath }) {
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'connected' | 'error'

  async function handleConnect() {
    try {
      setStatus("loading");
      const params = new URLSearchParams();
      params.set("format", "json");
      if (redirectPath) {
        params.set("redirect", redirectPath);
      }
      const res = await fetch(`/api/auth/google/start?${params.toString()}`);
      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url; // redirect to Google OAuth consent
      } else {
        setStatus("error");
      }
    } catch (e) {
      console.error("GA4 connect error:", e);
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 mt-8">
      {status === "idle" && (
        <button
          onClick={handleConnect}
          className="px-6 py-3 bg-[#4285F4] text-white rounded-lg hover:bg-[#357AE8] transition-all font-medium"
        >
          🔗 Connect Google Analytics
        </button>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-3 text-gray-600">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
          Connecting to Google Analytics...
        </div>
      )}

      {status === "connected" && (
        <div className="text-green-600 font-medium">
          ✅ GA4 connected successfully — fetching insights...
        </div>
      )}

      {status === "error" && (
        <div className="text-red-600 font-medium">
          ❌ Connection failed — please try again.
        </div>
      )}
    </div>
  );
}
