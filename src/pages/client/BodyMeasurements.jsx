import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { MEASURES, HOW_TO, withComposition, changeOf, latestOf, firstOf, signed } from '../../lib/measurements'

const ANTON = "'Anton','Barlow Condensed',system-ui,sans-serif"
const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
const pct = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

function Tile({ label, value, sub, accent }) {
  return (
    <div style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderTop: '3px solid var(--orange)', borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: ANTON, fontSize: 26, lineHeight: 1.15, marginTop: 3, color: accent ? 'var(--orange-hot)' : 'var(--white)' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8, color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  )
}

// Simple waist line chart, newest on the right.
function Trend({ rows }) {
  const pts = rows.filter(r => r.waist != null && r.waist !== '').map(r => ({ d: r.log_date, v: Number(r.waist) }))
  if (pts.length < 2) return <p className="muted" style={{ fontSize: 12.5 }}>The trend shows once there are two waist measurements.</p>
  const W = 600, H = 180, P = 30
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v))
  const span = hi - lo || 1
  const x = i => P + (i * (W - P * 2)) / (pts.length - 1)
  const y = v => H - P - ((v - lo) / span) * (H - P * 2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720, height: 'auto', background: 'var(--coal)', borderRadius: 8, display: 'block' }} role="img" aria-label="Waist trend">
      {[lo, (lo + hi) / 2, hi].map((v, i) => <g key={i}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={4} y={y(v) + 4} fill="var(--muted)" fontSize="11">{v.toFixed(1)}</text></g>)}
      <polyline fill="none" stroke="var(--orange)" strokeWidth="3" points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')} />
      {pts.map((p, i) => <g key={p.d}><circle cx={x(i)} cy={y(p.v)} r="4.5" fill="var(--orange)" /><text x={x(i)} y={H - 8} fill="var(--muted)" fontSize="11" textAnchor="middle">{fmtD(p.d).replace(/, \d+$/, '')}</text></g>)}
    </svg>
  )
}

// The sheet's Measurements tab. Used on the client's page and the coach's.
export default function BodyMeasurements({ clientId, isCoach }) {
  const [rows, setRows] = useState([])
  const [who, setWho] = useState(null)
  const [weights, setWeights] = useState({})
  const [date, setDate] = useState(localDateStr())
  const [form, setForm] = useState({})
  const [draft, setDraft] = useState({})
  const [msg, setMsg] = useState('')

  async function load() {
    const [{ data: m }, { data: p }, { data: w }] = await Promise.all([
      supabase.from('body_measurements').select('*').eq('client_id', clientId).order('log_date'),
      supabase.from('profiles').select('id, height_in, sex').eq('id', clientId).single(),
      supabase.from('daily_logs').select('log_date, weight').eq('client_id', clientId).not('weight', 'is', null),
    ])
    setRows(m || []); setWho(p || {}); setWeights(Object.fromEntries((w || []).map(x => [x.log_date, x.weight])))
  }
  useEffect(() => { if (clientId) load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId])

  // picking a date that already has a row loads it into the form
  useEffect(() => {
    const r = rows.find(x => x.log_date === date)
    setForm(Object.fromEntries(MEASURES.map(m => [m.db, r?.[m.db] ?? (m.db === 'weight' && weights[date] ? weights[date] : '')])))
  }, [date, rows, weights])

  async function saveEntry() {
    setMsg('')
    const row = { client_id: clientId, log_date: date }
    let any = false
    for (const m of MEASURES) {
      const v = String(form[m.db] ?? '').trim()
      if (v !== '' && Number.isNaN(Number(v))) { setMsg(`${m.label} isn't a number.`); return }
      row[m.db] = v === '' ? null : Number(v)
      if (v !== '' && m.db !== 'weight') any = true
    }
    if (!any) { setMsg('Enter at least one measurement.'); return }
    const { error } = await supabase.from('body_measurements').upsert(row, { onConflict: 'client_id,log_date' })
    if (error) { setMsg(/column/.test(error.message) ? 'Run the Update 96 SQL in Supabase first.' : 'Could not save: ' + error.message); return }
    setMsg('Saved ✓'); setTimeout(() => setMsg(''), 1800)
    load()
  }
  async function patch(r, key, raw) {
    const v = String(raw).trim() === '' ? null : Number(raw)
    if (v !== null && Number.isNaN(v)) return
    if ((r[key] ?? null) === v || Number(r[key]) === v) return
    setRows(list => list.map(x => (x.id === r.id ? { ...x, [key]: v } : x)))
    const { error } = await supabase.from('body_measurements').update({ [key]: v }).eq('id', r.id)
    if (error) { alert('Save failed: ' + error.message); load() }
  }
  async function remove(r) {
    if (!window.confirm(`Delete the ${fmtD(r.log_date)} measurements?`)) return
    await supabase.from('body_measurements').delete().eq('id', r.id)
    load()
  }
  async function saveWho(field, value) {
    setWho(w => ({ ...w, [field]: value }))
    await supabase.from('profiles').update({ [field]: value }).eq('id', clientId)
  }

  const comp = withComposition(rows, who?.height_in, who?.sex || 'male')
  const waistChg = changeOf(rows, 'waist')
  const bfNow = latestOf(comp, 'bf'), bfStart = firstOf(comp, 'bf')
  const leanChg = changeOf(comp, 'leanLb'), fatChg = changeOf(comp, 'fatLb')
  const th = { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '7px 4px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '2px 2px', borderTop: '1px solid var(--line)', fontSize: 13, textAlign: 'center' }
  const cellInput = (r, key, color) => {
    const k = `${r.id}|${key}`
    return (
      <input value={k in draft ? draft[k] : (r[key] ?? '')} inputMode="decimal" aria-label={`${key} ${r.log_date}`}
        onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
        onBlur={() => { if (k in draft) { patch(r, key, draft[k]); setDraft(d => { const n = { ...d }; delete n[k]; return n }) } }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ width: 58, padding: '5px 2px', fontSize: 13, textAlign: 'center', background: 'transparent', border: '1px solid transparent', color, fontWeight: color ? 800 : 500 }} />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <Tile accent label="Waist change" value={waistChg === null ? '—' : `${signed(waistChg)}"`} sub="since start" />
        <Tile label="Body fat (est.)" value={pct(bfNow)} sub={bfStart !== null ? `Start: ${pct(bfStart)}` : who?.height_in ? 'needs waist + neck' : 'needs height'} />
        <Tile label="Lean mass change" value={leanChg === null ? '—' : `${signed(leanChg, 1)} lb`} sub="since start" />
        <Tile accent label="Fat mass change" value={fatChg === null ? '—' : `${signed(fatChg, 1)} lb`} sub="since start" />
      </div>

      {isCoach && (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
          <span className="eyebrow" style={{ fontSize: 10, alignSelf: 'center' }}>For body fat</span>
          <div style={{ width: 90 }}><label className="muted" style={{ fontSize: 11 }}>Height (in)</label>
            <input inputMode="numeric" defaultValue={who?.height_in ?? ''} key={'h' + (who?.height_in ?? '')} onBlur={e => { const v = e.target.value.trim(); saveWho('height_in', v === '' ? null : Number(v)) }} /></div>
          <div style={{ width: 120 }}><label className="muted" style={{ fontSize: 11 }}>Formula</label>
            <select value={who?.sex || 'male'} onChange={e => saveWho('sex', e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></div>
          <span className="muted" style={{ fontSize: 11.5, paddingBottom: 10 }}>US Navy tape method: waist + neck (+ hips for female) and height.</span>
        </div>
      )}
      {!isCoach && !who?.height_in && who && <p className="muted" style={{ fontSize: 12 }}>Body fat shows once your coach adds your height.</p>}

      <Section title="Add measurements">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="muted" style={{ fontSize: 12 }}>Date</label>
            <input type="date" value={date} max={localDateStr()} onChange={e => setDate(e.target.value)} style={{ maxWidth: 170 }} />
            {rows.some(r => r.log_date === date) && <span style={{ fontSize: 11.5, color: 'var(--orange-hot)', fontWeight: 700 }}>Editing this date</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
            {MEASURES.map(m => (
              <div key={m.db}>
                <label className="muted" style={{ fontSize: 11, color: m.key ? 'var(--orange-hot)' : undefined, fontWeight: m.key ? 800 : 500 }}>{m.label} ({m.unit || 'in'})</label>
                <input inputMode="decimal" value={form[m.db] ?? ''} aria-label={`New ${m.label}`} onChange={e => setForm({ ...form, [m.db]: e.target.value })} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn" onClick={saveEntry} style={{ padding: '9px 18px', fontSize: 13 }}>Save measurements</button>
            {msg && <span style={{ fontSize: 12.5, color: msg.includes('✓') ? 'var(--orange-hot)' : 'var(--red)' }}>{msg}</span>}
          </div>
          <p className="muted" style={{ fontSize: 11 }}>Inches. Measure every 2 weeks on check-in morning. Weight fills in from that day's log.</p>
        </div>
      </Section>

      <Section title="Measurement log">
        {rows.length === 0 ? <div className="card muted" style={{ fontSize: 13.5 }}>No measurements yet.</div> : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={{ ...th, position: 'sticky', left: 0, zIndex: 1, minWidth: 74 }}>Date</th>
                {MEASURES.map(m => <th key={m.db} style={th}>{m.short}</th>)}
                <th style={th}>Body fat</th><th style={th}>Fat lb</th><th style={th}>Lean lb</th><th style={th} />
              </tr></thead>
              <tbody>
                {comp.map((r, i) => {
                  const bg = i % 2 ? 'var(--steel)' : 'var(--coal)'
                  return (
                    <tr key={r.id} style={{ background: bg }}>
                      <td style={{ ...td, position: 'sticky', left: 0, background: bg, fontWeight: 800, whiteSpace: 'nowrap', padding: '2px 6px' }}>{fmtD(r.log_date)}</td>
                      {MEASURES.map(m => <td key={m.db} style={td}>{cellInput(r, m.db, m.key ? 'var(--orange-hot)' : undefined)}</td>)}
                      <td style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800, padding: '2px 6px' }}>{pct(r.bf)}</td>
                      <td style={{ ...td, padding: '2px 6px' }}>{r.fatLb !== null ? r.fatLb.toFixed(1) : '—'}</td>
                      <td style={{ ...td, padding: '2px 6px' }}>{r.leanLb !== null ? r.leanLb.toFixed(1) : '—'}</td>
                      <td style={td}><button aria-label={`Delete ${r.log_date}`} onClick={() => remove(r)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
                <tr style={{ background: 'var(--steel)' }}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: 'var(--steel)', color: 'var(--orange-hot)', fontWeight: 900, borderTop: '1px solid var(--orange)', padding: '8px 6px' }}>CHANGE</td>
                  {MEASURES.map(m => {
                    const c = changeOf(rows, m.db)
                    return <td key={m.db} style={{ ...td, borderTop: '1px solid var(--orange)', fontWeight: 900, color: c !== null && c < 0 ? 'var(--orange-hot)' : undefined }}>{c === null ? '' : signed(c, m.dp || 2)}</td>
                  })}
                  {[['bf', v => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`], ['fatLb', v => signed(v, 1)], ['leanLb', v => signed(v, 1)]].map(([k, f]) => {
                    const c = changeOf(comp, k)
                    return <td key={k} style={{ ...td, borderTop: '1px solid var(--orange)', fontWeight: 900, color: c !== null && c < 0 && k !== 'leanLb' ? 'var(--orange-hot)' : undefined }}>{c === null ? '' : f(c)}</td>
                  })}
                  <td style={{ ...td, borderTop: '1px solid var(--orange)' }} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Waist trend"><Trend rows={rows} /></Section>

      <Section title="How to measure">
        <div style={{ borderRadius: 8, overflow: 'hidden' }}>
          {HOW_TO.map(([a, b], i) => (
            <div key={a} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr', gap: 10, padding: '8px 10px', background: i % 2 ? 'var(--steel)' : 'var(--coal)', fontSize: 13 }}>
              <strong style={{ color: 'var(--orange-hot)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{a}</strong><span>{b}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
