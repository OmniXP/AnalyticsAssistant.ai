export async function requestBillingPortalUrl() {
  const response = await fetch("/api/stripe/portal", { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) {
    throw new Error(data?.error || "Unable to open billing portal.");
  }
  return data.url;
}

