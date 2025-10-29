# AnalyticsAssistant.ai

AnalyticsAssistant.ai is a GA4 insights assistant. Users connect Google Analytics (read-only), pick a GA4 property, and receive clear, actionable summaries of traffic, conversion, and opportunities — without building reports manually.

> Status: MVP in progress — GA4 OAuth + Property Picker live; Stripe entitlements & webhooks live; KV token storage in progress.

---

## ✨ Features (MVP)
- **Google Sign-in (OAuth, PKCE)** with **read-only** GA4 scope
- **GA4 Property Picker** (lists properties the user has access to)
- **Premium entitlements** (Stripe Checkout + Webhooks) with green/red status UI
- **Backwards-compatible** manual Property ID input
- **Server-side auth & status** (`/api/auth/google/status`, `/api/auth/google/disconnect`)
- **Defence-in-depth premium check** (`/api/premium/require`)
- **Observability**: simple API latency logs

---

## 🧩 Tech Stack
- **Runtime:** Node 18+ (server), React/Next.js (front-end)  
- **Hosting:** Vercel  
- **Storage:** Vercel KV (recommended for token persistence)  
- **Payments:** Stripe (Checkout, Webhooks, Customer Portal)  
- **APIs:** Google Analytics Admin API, Analytics Data API

---

## 🚀 Quick Start (local)

### 1) Prerequisites
- Node 18+
- A Google Cloud project with OAuth set up
- GA4 property access on your Google account

### 2) Environment variables (`.env`)
Create a `.env` file in the project root:

