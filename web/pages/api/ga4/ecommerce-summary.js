// web/pages/api/ga4/ecommerce-summary.js
// Thin wrapper that forwards to /api/ga4/query using the "ecomKpis" preset.
// It relies on the aa_auth cookie + Upstash session handled inside query.js.

import queryHandler from './query';

export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Allow client to pass property/startDate/endDate/lastDays/limit; force the preset.
  req.body = { ...(req.body || {}), preset: 'ecomKpis' };

  // Delegate to the shared GA4 runner which:
  //  - reads the Google access token from aa_auth via Upstash
  //  - builds the request body for this preset
  //  - calls GA4 Data API and returns a stable { dimensionHeaders, metricHeaders, rows, ... } shape
  return queryHandler(req, res);
}
