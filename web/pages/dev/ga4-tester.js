// web/pages/dev/ga4-tester.js
import { useEffect, useState } from 'react';

export default function GA4Tester() {
  const [status, setStatus] = useState(null);
  const [propsRes, setPropsRes] = useState(null);
  const [queryRes, setQueryRes] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [propertyId, setPropertyId] = useState('');

  function log(line) { setLogs((prev) => [String(line), ...prev].slice(0, 200)); }

  async function getJSON(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
    let body = null; try { body = await res.json(); } catch { body = await res.text(); }
    return { ok: res.ok, status: res.status, body };
  }

  function connectGoogle() { window.location.assign('/api/auth/google/start'); }
  async function disconnectGoogle() {
    setIsBusy(true);
    const { ok, status, body } = await getJSON('/api/auth/google/disconnect', { method: 'POST' });
    log(`disconnect → ${status}`); if (!ok) log(JSON.stringify(body, null, 2));
    await refreshStatus(); setIsBusy(false);
  }
  async function refreshStatus() {
    const { ok, status, body } = await getJSON('/api/auth/google/status');
    log(`status → ${status}`); setStatus(body);
  }
  async function listProperties() {
    setIsBusy(true); setPropsRes(null);
    const { status, body } = await getJSON('/api/ga4/properties');
    log(`properties → ${status}`); setPropsRes(body); setIsBusy(false);
  }
  async function runDefaultReport() {
    setIsBusy(true); setQueryRes(null);
    const payload = {};
    if (propertyId.trim()) payload.property = propertyId.trim();
    const { status, body } = await getJSON('/api/ga4/query', { method: 'POST', body: JSON.stringify(payload) });
    log(`query → ${status}`); setQueryRes(body); setIsBusy(false);
  }

  useEffect(() => { refreshStatus(); }, []);

  return (
    <div style={{ fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial', padding:24, maxWidth:1100, margin:'0 auto' }}>
      <h1>GA4 Manual Tester</h1>

      <section style={card()}>
        <h2 style={{marginTop:0}}>1) Connect / Disconnect</h2>
        <p><strong>Important:</strong> Connect performs a browser navigation to <code>/api/auth/google/start</code>.</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <button onClick={connectGoogle} disabled={isBusy} style={btn()}>Connect Google</button>
          <button onClick={disconnectGoogle} disabled={isBusy} style={btn('ghost')}>Disconnect</button>
          <button onClick={refreshStatus} disabled={isBusy} style={btn('secondary')}>Check Status</button>
        </div>
        <div style={{marginTop:12}}>
          <h4 style={{margin:'12px 0 6px'}}>Status:</h4>
          <pre style={pre()}>{safe(status)}</pre>
        </div>
      </section>

      <section style={card()}>
        <h2 style={{marginTop:0}}>2) Admin: List Properties</h2>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <button onClick={listProperties} disabled={isBusy} style={btn()}>List Properties</button>
        </div>
        <div style={{marginTop:12}}>
          <pre style={pre()}>{safe(propsRes)}</pre>
        </div>
      </section>

      <section style={card()}>
        <h2 style={{marginTop:0}}>3) Data: Run Report</h2>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <label>
            Property (optional):{' '}
            <input value={propertyId} onChange={(e)=>setPropertyId(e.target.value)} placeholder="properties/123456789" style={{padding:8,minWidth:260}}/>
          </label>
          <button onClick={runDefaultReport} disabled={isBusy} style={btn()}>Run GA4 Report</button>
        </div>
        <div style={{marginTop:12}}>
          <pre style={pre()}>{safe(queryRes)}</pre>
        </div>
      </section>

      <section style={card()}>
        <h2 style={{marginTop:0}}>Logs</h2>
        <pre style={pre()}>{logs.join('\n')}</pre>
      </section>
    </div>
  );
}

function card(){ return { margin:'16px 0', padding:16, border:'1px solid #333', borderRadius:8 }; }
function btn(variant){
  const base = { padding:'10px 14px', borderRadius:8, border:'1px solid #333', background:'#111', color:'#fff', cursor:'pointer' };
  if (variant==='secondary') return { ...base, background:'#333' };
  if (variant==='ghost') return { ...base, background:'transparent', color:'#111' };
  return base;
}
function pre(){ return { whiteSpace:'pre-wrap', background:'#111', color:'#f5f5f5', padding:12, borderRadius:8, margin:0, maxHeight:420, overflow:'auto', fontSize:13 }; }
function safe(x){ try { return JSON.stringify(x,null,2); } catch { return String(x); } }
