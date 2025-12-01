let hasWarned = false;

function getGtag() {
  if (typeof window === "undefined") return null;
  if (typeof window.gtag !== "function") {
    if (process.env.NODE_ENV !== "production" && !hasWarned) {
      // eslint-disable-next-line no-console
      console.warn("[analytics] gtag is not available yet. Event will be skipped.");
      hasWarned = true;
    }
    return null;
  }
  return window.gtag;
}

export function trackEvent(name, params = {}) {
  const gtag = getGtag();
  if (!gtag || !name) return;
  gtag("event", name, params);
}

export function setAnalyticsUser(userId) {
  if (!userId) return;
  const gtag = getGtag();
  if (!gtag) return;
  gtag("set", { user_id: String(userId) });
}

