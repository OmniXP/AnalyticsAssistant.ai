// pages/api/dev/selfcheck.js
// One-stop diagnostics: token scopes, props list, property GET, minimal runReport.
import { getBearerForRequest } from '../_core/ga4-session';
export const config = { runtime: 'nodejs' };

async function fetchJSON(res) {
  const text = await res.text();
  try { return { json: JSON.parse(text), text, ok: res.ok, status: res.status }; }
  catch { return { json: null, text, ok: res.ok, status: res.status }; }
}
async function tokenInfo(token) {
  const r = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
  return fetchJSON(r);
}
async function listProperties(token) {
  const r = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  const out = await fetchJSON(r);
  if (!out.ok) return { error: { where: 'accountSummaries', status: out.status, details: out.json || out.text } };
  const props = [];
  for (const acc of (out.json?.accountSummaries || [])) {
    for (const p of (acc.propertySummaries || [])) {
      props.push({
        account: acc.name, accountDisplayName: acc.displayName,
        property: p.property, propertyDisplayName: p.displayName,
      });
    }
  }
  return { properties: props, raw: out.json };
}
async function adminGetProperty(token, property) {
  const r = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${property}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  return fetchJSON(r);
}
async function runSample(token, property) {
  const payload = {
    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
    metrics: [{ name: 'activeUsers' }],
  };
  const url = `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const out = await fetchJSON(r);
  return { ...out, payloadSent: payload };
}

export default async function handler(req, res) {
  try {
    const { token } = await getBearerForRequest(req);
    if (!token) return res.status(200).json({ connected: false });

    const info = await tokenInfo(token);
    const results = {
      connected: true,
      tokeninfo: info.json || info.text,
      tokeninfoStatus: info.status,
    };

    const listing = await listProperties(token);
    results.properties = listing.properties || [];
    results.propertiesRawStatus = listing.error ? listing.error.status : 200;
    if (listing.error) {
      results.propertiesError = listing.error;
      return res.status(200).json(results);
    }

    const qProp = req.query.property;
    const property = qProp || (results.properties[0]?.property);
    results.propertyChosen = property || null;

    if (!property) {
      results.sample = { skipped: true, reason: 'No GA4 properties available' };
      return res.status(200).json(results);
    }

    const propCheck = await adminGetProperty(token, property);
    results.propertyCheck = {
      ok: propCheck.ok,
      status: propCheck.status,
      details: propCheck.json || propCheck.text,
    };
    if (!propCheck.ok) return res.status(200).json(results);

    const sample = await runSample(token, property);
    results.sample = {
      ok: sample.ok,
      status: sample.status,
      details: sample.json || sample.text,
      payloadSent: sample.payloadSent,
    };

    res.status(200).json(results);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'selfcheck failed', message: e?.message || String(e) });
  }
}
