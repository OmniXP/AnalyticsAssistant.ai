import React, { useState } from 'react';

export default function RunGa4Test() {
  const [status, setStatus] = useState(null);
  const [propsList, setPropsList] = useState([]);
  const [property, setProperty] = useState('');
  const [report, setReport] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function go(path, opts) {
    const res = await fetch(path, { credentials: 'include', ...(opts || {}) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    if (!res.ok) {
      const err = (json && (json.error || json.details || json.message)) || text || res.statusText;
      throw Object.assign(new Error(typeof err === 'string' ? err : 'Request failed'), {
        status: res.status,
        payload: json || text || null,
      });
    }
    return json || { raw: text };
  }

  function startOAuth() {
    window.location.href = '/api/auth/google/start';
  }

  async function checkStatus() {
    setBusy(true); setServerError(null);
    try { setStatus(await go('/api/auth/google/status')); }
    catch (e) { setServerError({ message: e.message, status: e.status, payload: e.payload }); }
    finally { setBusy(false); }
  }

  async function listProps() {
    setBusy(true); setServerError(null);
    try {
      const r = await go('/api/ga4/properties');
      const list = r.properties || [];
      setPropsList(list);
      if (!property && list.length > 0) setProperty(list[0].property);
    } catch (e) {
      setServerError({ message: e.message, status: e.status, payload: e.payload });
    } finally { setBusy(false); }
  }

  async function runReport() {
    setBusy(true); setServerError(null); setReport(null);
    try {
      const body = property ? { property } : {};
      const r = await go('/api/ga4/query', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
      });
      setReport(r);
    } catch (e) {
      setServerError({ message: e.message, status: e.status, payload: e.payload });
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true); setServerError(null);
    try {
      await go('/api/auth/google/disconnect', { method: 'POST' });
      setStatus(null); setPropsList([]); setReport(null); setProperty('');
    } catch (e) {
      setServerError({ message: e.message, status: e.status, payload: e.payload });
    } finally { setBusy(false); }
  }

  return (
    <div style={{maxWidth: 900, margin: '40px auto', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'}}>
      <h1>GA4 Manual Tester</h1>
      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12}}>
        <button onClick={startOAuth}>1) Connect Google</button>
        <button onClick={checkStatus}>2) Check Status</button>
        <button onClick={listProps}>3) List Properties</button>
        <button onClick={runReport}>4) Run Default Report</button>
        <button onClick={disconnect}>Disconnect</button>
      </div>

      <section style={{border:'1px solid #ddd', padding:12, borderRadius:8, marginBottom:16}}>
        <strong>Status:</strong>
        <pre>{JSON.stringify(status, null, 2)}</pre>
      </section>

      <section style={{border:'1px solid #ddd', padding:12, borderRadius:8, marginBottom:16}}>
        <strong>Properties:</strong>
        <div style={{margin:'8px 0'}}>
          <input style={{width:'100%', padding:8}} placeholder='properties/123456789'
                 value={property} onChange={e=>setProperty(e.target.value)} />
          <div style={{fontSize:12, color:'#555'}}>Click a property below to auto-fill ↑</div>
        </div>
        <ul style={{listStyle:'none', padding:0}}>
          {propsList.map((p) => (
            <li key={p.property} style={{padding:'6px 8px', border:'1px solid #eee', borderRadius:6, margin:'6px 0', cursor:'pointer'}}
                onClick={()=>setProperty(p.property)}>
              <div><strong>{p.propertyDisplayName}</strong></div>
              <div style={{fontSize:12, color:'#666'}}>{p.property} · {p.accountDisplayName}</div>
            </li>
          ))}
        </ul>
      </section>

      {busy && <div>Working…</div>}
      {serverError && (
        <section style={{border:'1px solid #f3c', padding:12, borderRadius:8, marginBottom:16, background:'#fff7ff'}}>
          <strong>Server Error</strong>
          <pre>{JSON.stringify(serverError, null, 2)}</pre>
        </section>
      )}

      <section style={{border:'1px solid #ddd', padding:12, borderRadius:8}}>
        <strong>Report JSON:</strong>
        <pre>{report ? JSON.stringify(report, null, 2) : 'Run a report to see output.'}</pre>
      </section>
    </div>
  );
}
