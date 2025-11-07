// web/pages/api/ga4/top-pages.js
import queryHandler from './query';

export const config = { runtime: 'nodejs' };

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  // Force the topPages preset; client may pass property / dates / limit / filters.
  req.body = { ...(req.body || {}), preset: 'topPages' };

  return queryHandler(req, res);
}
