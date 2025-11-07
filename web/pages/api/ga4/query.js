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

// GA4 filter (AND group) for optional Country + Channel Group
function buildDimensionFilter(filters) {
  if (!filters) return undefined;
  const exprs = [];

  const country = tidy(filters.country);
  if (country) {
    exprs.push({
      filter: {
        fieldName: 'country',
        stringFilter: { value: country, matchType: 'EXACT' },
      },
    });
  }

  const channelGroup = tidy(filters.channelGroup);
  if (channelGroup) {
    exprs.push({
      filter: {
        fieldName: 'sessionDefaultChannelGroup',
        stringFilter: { value: channelGroup, matchType: 'EXACT' },
      },
    });
  }

  if (!exprs.length) return undefined;
  if (exprs.length === 1) return exprs[0];
  return { andGroup: { expressions: exprs } };
}

function tidy(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'all') return null;
  return s;
}

// Build a report request for common presets.
// IMPORTANT: order of dimensions must match what the UI expects.
function buildPreset({ preset, startDate, endDate, limit, filters }) {
  const dateRanges = [{ startDate, endDate }];
  const keepLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100000, limit)) : undefined;
  const dimensionFilter = buildDimensionFilter(filters);

  switch (preset) {
    case 'channels': {
      // Channel summary: channel first, no date dimension
      return {
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };
    }

    case 'sourceMedium': {
      // Use session-scoped source/medium for session metrics
      return {
        dateRanges,
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 50,
      };
    }

    case 'topPages': {
      // Keep pageTitle then pagePath (many UIs expect both in this order)
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
      // No dimensions; aggregate KPIs in a single row (index-stable)
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
      // Date-only timeseries (UI will use date on dimensionValues[0])
      return {
        dateRanges,
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'conversions' },
          { name: 'purchaseRevenue' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: keepLimit || 1000,
      };
    }

    default: {
      // Safe default: small channel summary
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
  if (!resp.ok) return { ok: false, status: resp.status, body: json || text };
  return { ok: true, status: resp.status, body: json };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    const { token } = await session.getBearerForRequest(req);
    if (!token) return res.status(401).json({ error: 'Not connected' });

    const {
      property,
      propertyId,              // alias
      preset = 'channels',
      startDate, endDate,
      lastDays,
      limit,
      filters,                 // { country?, channelGroup? }
    } = (req.body || {});

    const chosenProperty = property || (propertyId ? `properties/${propertyId}` : null);
    if (!chosenProperty) {
      return res.status(400).json({ error: 'No GA4 property selected or provided' });
    }

    const dates = normalizeDates({ startDate, endDate, lastDays });
    const body = buildPreset({
      preset,
      startDate: dates.startDate,
      endDate: dates.endDate,
      limit,
      filters,
    });

    const out = await runReport({ token, property: chosenProperty, body });
    if (!out.ok) {
      return res
        .status(out.status)
        .json({ error: 'query_failed', details: out.body, request: { property: chosenProperty, preset, body } });
    }

    res.status(200).json({
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
