// web/pages/api/ga4/query.js
import * as session from '../_core/ga4-session';

export const config = { runtime: 'nodejs' };

const GA = 'https://analyticsdata.googleapis.com/v1beta';

function toISO(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return toISO(d); }

function normalizeDates({ startDate, endDate, lastDays }) {
  if (startDate && endDate) return { startDate, endDate };
  const days = Number.isFinite(lastDays) ? lastDays : 28;
  return { startDate: daysAgo(days), endDate: daysAgo(0) };
}

// --- Filter helpers (country + channelGroup) ---
function tidy(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'all') return null;
  return s;
}
function buildDimensionFilter(filters) {
  if (!filters) return undefined;
  const exprs = [];
  const country = tidy(filters.country);
  if (country) exprs.push({ filter: { fieldName: 'country', stringFilter: { value: country, matchType: 'EXACT' } } });
  const channelGroup = tidy(filters.channelGroup);
  if (channelGroup) exprs.push({ filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: channelGroup, matchType: 'EXACT' } } });
  if (!exprs.length) return undefined;
  if (exprs.length === 1) return exprs[0];
  return { andGroup: { expressions: exprs } };
}

// --- Presets (ordered for your UI expectations) ---
function buildPreset({ preset, startDate, endDate, limit, filters }) {
  const dateRanges = [{ startDate, endDate }];
  const keepLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100000, limit)) : undefined;
  const dimensionFilter = buildDimensionFilter(filters);

  switch (preset) {
    case 'channels': {
      return {
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' }, // may be rejected if e-com not enabled
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };
    }
    case 'sourceMedium': {
      return {
        dateRanges,
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' }, // may be rejected if e-com not enabled
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };
    }
    case 'topPages': {
      return {
        dateRanges,
        dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };
    }
    case 'ecomSummary':
    case 'ecomKpis': {
      return {
        dateRanges,
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchases' },
          { name: 'purchaseRevenue' },
          { name: 'engagementRate' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
        ],
        limit: keepLimit || 1,
      };
    }
    case 'timeseries': {
      return {
        dateRanges,
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' }, // may be rejected if e-com not enabled
        ],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 1000,
      };
    }
    default: {
      return {
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 25,
      };
    }
  }
}

async function runReport({ token, property, body }) {
  const url = `${GA}/${encodeURIComponent(property)}:runReport`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await resp.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { ok: resp.ok, status: resp.status, body: json || text };
}

// Remove one or more metrics by name from a request body (for fallback)
function dropMetrics(body, names) {
  if (!body?.metrics) return body;
  const set = new Set(names);
  return {
    ...body,
    metrics: body.metrics.filter(m => !set.has(m.name)),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const {
      property,
      propertyId,
      preset = 'channels',
      startDate, endDate,
      lastDays,
      limit,
      filters,
    } = (req.body || {});

    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (!chosenProperty) {
      return res.status(400).json({ error: 'No GA4 property selected or provided' });
    }

    const dates = normalizeDates({ startDate, endDate, lastDays });
    const initial = buildPreset({
      preset,
      startDate: dates.startDate,
      endDate: dates.endDate,
      limit,
      filters,
    });

    // 1st attempt
    let out = await runReport({ token, property: chosenProperty, body: initial });
    if (!out.ok) {
      // If GA rejects the request, surface GA’s message…
      const gaMsg = out.body?.error?.message || (typeof out.body === 'string' ? out.body : null);

      // …and try one safe fallback if it looks like an incompatibility:
      // drop purchaseRevenue (often the culprit on non-commerce properties)
      const status = Number(out.status) || 0;
      const looksLikeBadCombo = status === 400 || status === 422; // invalidArgument / failedPrecondition
      const hasRevenue = Array.isArray(initial.metrics) && initial.metrics.some(m => m.name === 'purchaseRevenue');

      if (looksLikeBadCombo && hasRevenue) {
        const fallback = dropMetrics(initial, ['purchaseRevenue']);
        const out2 = await runReport({ token, property: chosenProperty, body: fallback });
        if (out2.ok) {
          return res.status(200).json({
            ok: true,
            preset,
            property: chosenProperty,
            dateRange: { startDate: dates.startDate, endDate: dates.endDate },
            dimensionHeaders: out2.body.dimensionHeaders || [],
            metricHeaders: out2.body.metricHeaders || [],
            rows: out2.body.rows || [],
            total: out2.body.rowCount ?? (out2.body.rows ? out2.body.rows.length : 0),
            note: 'Auto-fallback: purchaseRevenue removed due to GA4 invalid combo.',
            originalError: gaMsg || out.body,
          });
        }
      }

      return res.status(out.status).json({
        error: 'query_failed',
        ga_message: gaMsg || null,
        details: out.body,
        request: { property: chosenProperty, preset, body: initial },
      });
    }

    // success
    return res.status(200).json({
      ok: true,
      preset,
      property: chosenProperty,
      dateRange: { startDate: dates.startDate, endDate: dates.endDate },
      dimensionHeaders: out.body.dimensionHeaders || [],
      metricHeaders: out.body.metricHeaders || [],
      rows: out.body.rows || [],
      total: out.body.rowCount ?? (out.body.rows ? out.body.rows.length : 0),
    });
  } catch (e) {
    res.status(500).json({ error: 'query_exception', message: e?.message || String(e) });
  }
}
