// web/pages/dev/query-sanity.js
// Confirms the active /api/ga4/query handler accepts propertyId and normalises to `properties/{id}`.

export default function Page() {
  async function probe() {
    const inputPropertyId = document.getElementById('pid').value.trim();
    if (!inputPropertyId) {
      alert('Enter a property id like 123456789');
      return;
    }

    const normalised = inputPropertyId.startsWith('properties/')
      ? inputPropertyId
      : `properties/${inputPropertyId}`;

    const payload = {
      propertyId: inputPropertyId, // UI sends plain id, server should normalise
      preset: 'channels',
      lastDays: 7,
      limit: 5,
    };

    const resp = await fetch('/api/ga4/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    const out = document.getElementById('out');
    out.textContent = JSON.stringify({ status: resp.status, body: json || text }, null, 2);
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Query sanity</h1>
      <p>Enter GA4 property id, click run. The API should accept plain id and normalise to properties/{{id}}.</p>
      <input id="pid" placeholder="123456789" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
      <button onClick={probe} style={{ marginLeft: 8, padding: '8px 12px' }}>Run</button>
      <pre id="out" style={{ marginTop: 12, background: '#f7f7f7', padding: 12, borderRadius: 6 }} />
    </div>
  );
}
