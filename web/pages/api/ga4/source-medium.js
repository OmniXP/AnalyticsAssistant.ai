// web/pages/api/ga4/source-medium.js
import queryHandler from './query';

export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // Pass through existing body (property / propertyId / startDate / endDate / lastDays / limit / filters),
  // but force the preset expected by the UI.
  req.body = { ...(req.body || {}), preset: 'sourceMedium' };

  return queryHandler(req, res);
}
