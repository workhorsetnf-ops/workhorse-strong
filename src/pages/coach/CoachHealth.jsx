import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Pill, Droplet, Plus, Trash2, HeartPulse, CalendarCheck } from 'lucide-react'
import CoachCardio from './CoachCardio'
import CoachHabits from './CoachHabits'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom } from '../../lib/weeks'
import { MARKERS, CATEGORIES, MARKER_NOTES, rangeFor, statusOf, resultsByMarker, fmtRange } from '../../lib/bloodwork'

// Common stack, one tap each — the coach still edits dose/notes per client.
export const SUPP_PRESETS = [
  { name: 'Creatine Monohydrate', dose: '5 g', timing: 'Any time', purpose: 'Strength, power, recovery', monthly_cost: 15 },
  { name: 'Whey Protein', dose: '1–2 scoops', timing: 'As needed', purpose: 'Hit the protein target', monthly_cost: 45, notes: 'Counts toward macros — log it' },
  { name: 'Vitamin D3', dose: '2,000 IU', timing: 'With a meal', purpose: 'Bone, immune and hormone support', monthly_cost: 8, notes: 'Adjust based on bloodwork' },
  { name: 'Fish Oil', dose: '2 g EPA + DHA', timing: 'With a meal', purpose: 'Joint and heart health', monthly_cost: 20 },
  { name: 'Magnesium Glycinate', dose: '300 mg', timing: 'Bedtime', purpose: 'Sleep and recovery', monthly_cost: 12 },
  { name: 'Electrolytes', dose: '1 serving', timing: 'Training / travel days', purpose: 'Hydration, cramp prevention', monthly_cost: 20, notes: 'Extra on show days' },
  { name: 'Caffeine', dose: '100–200 mg', timing: 'Pre-workout', purpose: 'Training performance', monthly_cost: 10, notes: 'None within 8 hrs of bed' },
  { name: 'Multivitamin', dose: '1 serving', timing: 'Breakfast', purpose: 'Fill micronutrient gaps', monthly_cost: 10 },
]
export const TIMINGS = ['Morning', 'Breakfast', 'With a meal', 'Pre-workout', 'Post-workout', 'Bedtime', 'Any time', 'As needed', 'Training / travel days']

// Doses taken out of doses due so far this week (today counts as due).
export function weekCompliance(supps, logs, days, today = localDateStr()) {
  const due = days.filter(d => d <= today).length * supps.length
  if (!due) return null
  const ids = new Set(supps.map(s => s.id))
  const taken = logs.filter(l => ids.has(l.supplement_id) && days.includes(l.log_date) && l.log_date <= today).length
  return Math.min(1, taken / due)
}

export function Tile({ label, value, sub, accent, warn }) {
  return (
    <div style={{ background: warn ? 'rgba(214,69,69,0.18)' : 'var(--coal)', border: '1px solid var(--line)', borderTop: '3px solid var(--orange)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, marginTop: 4, color: warn ? 'var(--red)' : accent ? 'var(--orange-hot)' : 'var(--white)', fontFamily: "'Anton','Barlow Condensed',system-ui,sans-serif", letterSpacing: '.01em' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
const DAY_LETTERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export default function CoachHealth() {
  const { clientId } = useParams()
  const [client, setClient] = useState(null)
  const [tab, setTab] = useState('supplements')
  const [supps, setSupps] = useState([])
  const [logs, setLogs] = useState([])
  const [tests, setTests] = useState([])
  const [results, setResults] = useState([])
  const [ranges, setRanges] = useState({})
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(0)
  const [newTestDate, setNewTestDate] = useState(localDateStr())
  const [onlyFlagged, setOnlyFlagged] = useState(false)

  const today = localDateStr()
  const days = weekDaysFrom(mondayOf(today))

  async function loadSupps() {
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from('client_supplements').select('*').eq('client_id', clientId).order('position').order('created_at'),
      supabase.from('supplement_logs').select('supplement_id, log_date').eq('client_id', clientId).gte('log_date', days[0]).lte('log_date', days[6]),
    ])
    setSupps(s || []); setLogs(l || [])
  }
  async function loadBlood() {
    const [{ data: t }, { data: r }, { data: rg }] = await Promise.all([
      supabase.from('blood_tests').select('*').eq('client_id', clientId).order('test_date'),
      supabase.from('blood_results').select('*').eq('client_id', clientId),
      supabase.from('client_blood_ranges').select('*').eq('client_id', clientId),
    ])
    setTests(t || []); setResults(r || []); setRanges(Object.fromEntries((rg || []).map(x => [x.marker, x])))
  }
  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('id', clientId).single().then(({ data }) => setClient(data))
    loadSupps(); loadBlood()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function run(fn) { setBusy(b => b + 1); try { await fn() } finally { setBusy(b => b - 1) } }

  // ---------------- supplements ----------------
  async function addSupp(preset) {
    await run(async () => {
      const { error } = await supabase.from('client_supplements').insert({ client_id: clientId, position: supps.length, ...preset })
      if (error) alert('Could not add: ' + error.message)
      await loadSupps()
    })
  }
  async function patchSupp(id, field, value) {
    const cur = supps.find(s => s.id === id)
    const v = field === 'monthly_cost' ? (value === '' ? null : Number(value)) : value
    if (cur && String(cur[field] ?? '') === String(v ?? '')) return
    setSupps(list => list.map(s => (s.id === id ? { ...s, [field]: v } : s)))
    await run(async () => {
      const { error } = await supabase.from('client_supplements').update({ [field]: v }).eq('id', id)
      if (error) { alert('Save failed: ' + error.message); loadSupps() }
    })
  }
  async function removeSupp(s) {
    if (!window.confirm(`Remove ${s.name} from ${client?.full_name || 'this client'}'s stack? Their tick history for it goes too.`)) return
    await run(async () => { await supabase.from('client_supplements').delete().eq('id', s.id); await loadSupps() })
  }
  const suppCell = (s, field, opts = {}) => {
    const key = `${s.id}|${field}`
    return (
      <input value={key in draft ? draft[key] : String(s[field] ?? '')} placeholder={opts.ph} list={opts.list}
        inputMode={opts.mode} aria-label={`${s.name} ${field}`}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        onBlur={() => { if (key in draft) { patchSupp(s.id, field, String(draft[key]).trim()); setDraft(d => { const n = { ...d }; delete n[key]; return n }) } }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ padding: '6px 8px', fontSize: 13, textAlign: opts.center ? 'center' : 'left', fontWeight: opts.bold ? 700 : 500, ...opts.style }} />
    )
  }
  const taken = new Set(logs.map(l => `${l.supplement_id}|${l.log_date}`))
  const compliance = weekCompliance(supps, logs, days, today)
  const monthly = supps.reduce((a, s) => a + (Number(s.monthly_cost) || 0), 0)

  // ---------------- bloodwork ----------------
  const byMarker = useMemo(() => resultsByMarker(tests, results), [tests, results])
  const shownTests = tests.slice(-4)
  const rows = MARKERS.map(m => {
    const r = rangeFor(m.name, ranges)
    const latest = byMarker[m.name]?.latest || null
    return { ...m, range: r, latest, status: latest ? statusOf(latest.value, r) : null }
  })
  const tested = rows.filter(r => r.latest).length
  const inRange = rows.filter(r => r.status === 'IN RANGE').length
  const flagged = rows.filter(r => r.status === 'HIGH' || r.status === 'LOW').length

  async function addTest() {
    if (!newTestDate) return
    if (tests.some(t => t.test_date === newTestDate)) { alert('There is already a test on that date.'); return }
    await run(async () => { await supabase.from('blood_tests').insert({ client_id: clientId, test_date: newTestDate }); await loadBlood() })
  }
  async function removeTest(t) {
    if (!window.confirm(`Delete the ${fmtD(t.test_date)} test and every result on it?`)) return
    await run(async () => { await supabase.from('blood_tests').delete().eq('id', t.id); await loadBlood() })
  }
  async function saveResult(test, marker, raw) {
    const v = String(raw).trim()
    const existing = results.find(r => r.test_id === test.id && r.marker === marker)
    if (v === '' && !existing) return
    if (existing && v !== '' && Number(v) === Number(existing.value)) return
    if (v !== '' && Number.isNaN(Number(v))) { alert(`"${v}" isn't a number.`); return }
    await run(async () => {
      if (v === '') await supabase.from('blood_results').delete().eq('id', existing.id)
      else await supabase.from('blood_results').upsert({ test_id: test.id, client_id: clientId, marker, value: Number(v) }, { onConflict: 'test_id,marker' })
      await loadBlood()
    })
  }
  async function saveRange(marker, field, raw) {
    const v = String(raw).trim() === '' ? null : Number(raw)
    if (v !== null && Number.isNaN(v)) return
    const def = MARKERS.find(m => m.name === marker)
    const cur = ranges[marker]
    const next = { ref_low: cur ? cur.ref_low : def.low, ref_high: cur ? cur.ref_high : def.high, [field]: v }
    await run(async () => {
      // back to the default on both ends → drop the override row entirely
      if (Number(next.ref_low ?? NaN) === Number(def.low ?? NaN) && Number(next.ref_high ?? NaN) === Number(def.high ?? NaN)) {
        if (cur) await supabase.from('client_blood_ranges').delete().eq('id', cur.id)
      } else {
        await supabase.from('client_blood_ranges').upsert({ client_id: clientId, marker, ...next }, { onConflict: 'client_id,marker' })
      }
      await loadBlood()
    })
  }
  const blurInput = (key, value, onSave, opts = {}) => (
    <input value={key in draft ? draft[key] : value} inputMode="decimal" aria-label={opts.label}
      onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
      onBlur={() => { if (key in draft) { onSave(draft[key]); setDraft(d => { const n = { ...d }; delete n[key]; return n }) } }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ padding: '5px 4px', fontSize: 13, textAlign: 'center', width: '100%', boxSizing: 'border-box', ...opts.style }} />
  )

  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '4px 6px', borderTop: '1px solid var(--line)', fontSize: 13, verticalAlign: 'middle' }

  return (
    <div>
      <Link to="/coach/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 13 }}>
        <ChevronLeft size={15} /> Back to Clients
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Health</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>{client?.full_name || 'Client'}</h1>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{busy ? 'Saving…' : 'All changes saved'}</span>
      </div>
      <div style={{ height: 3, background: 'var(--orange)', borderRadius: 2, margin: '8px 0 16px' }} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={tab === 'supplements' ? 'btn' : 'btn-ghost'} onClick={() => setTab('supplements')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Pill size={15} /> Supplements</button>
        <button className={tab === 'bloodwork' ? 'btn' : 'btn-ghost'} onClick={() => setTab('bloodwork')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Droplet size={15} /> Bloodwork</button>
        <button className={tab === 'cardio' ? 'btn' : 'btn-ghost'} onClick={() => setTab('cardio')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><HeartPulse size={15} /> Cardio</button>
        <button className={tab === 'habits' ? 'btn' : 'btn-ghost'} onClick={() => setTab('habits')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CalendarCheck size={15} /> Habits</button>
      </div>

      {tab === 'supplements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Tile label="Supplements" value={supps.length} sub="in the stack" accent />
            <Tile label="Taken this week" value={compliance === null ? '—' : `${Math.round(compliance * 100)}%`} sub="of doses due so far" warn={compliance !== null && compliance < 0.7} />
            <Tile label="Monthly cost" value={`$${Math.round(monthly)}`} sub="estimated" />
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1050 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', paddingLeft: 12 }}>Supplement</th><th style={th}>Dose</th><th style={th}>Timing</th>
                  <th style={{ ...th, textAlign: 'left' }}>Purpose</th><th style={th}>Cost / mo</th>
                  {days.map((d, i) => <th key={d} style={{ ...th, background: d === today ? 'var(--white)' : 'var(--orange)' }}>{DAY_LETTERS[i]}</th>)}
                  <th style={th}>Done</th><th style={{ ...th, textAlign: 'left' }}>Notes</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {supps.length === 0 && (
                  <tr><td colSpan={16} style={{ ...td, padding: 16 }} className="muted">No supplements yet. Add from the common stack below or type your own.</td></tr>
                )}
                {supps.map((s, i) => {
                  const count = days.filter(d => taken.has(`${s.id}|${d}`)).length
                  return (
                    <tr key={s.id} style={{ background: i % 2 ? 'var(--steel)' : 'transparent' }}>
                      <td style={{ ...td, paddingLeft: 10, minWidth: 190 }}>{suppCell(s, 'name', { bold: true })}</td>
                      <td style={{ ...td, width: 120 }}>{suppCell(s, 'dose', { center: true, style: { color: 'var(--orange-hot)', fontWeight: 700 } })}</td>
                      <td style={{ ...td, width: 150 }}>{suppCell(s, 'timing', { list: 'supp-timings' })}</td>
                      <td style={{ ...td, minWidth: 180 }}>{suppCell(s, 'purpose')}</td>
                      <td style={{ ...td, width: 80 }}>{suppCell(s, 'monthly_cost', { center: true, mode: 'decimal', ph: '$' })}</td>
                      {days.map(d => {
                        const on = taken.has(`${s.id}|${d}`)
                        return <td key={d} style={{ ...td, textAlign: 'center', width: 42, background: on ? 'var(--orange)' : undefined, color: on ? '#000' : 'var(--muted)', fontWeight: 800 }}>{on ? '✓' : d > today ? '' : '·'}</td>
                      })}
                      <td style={{ ...td, textAlign: 'center', color: 'var(--orange-hot)', fontWeight: 800 }}>{count}/7</td>
                      <td style={{ ...td, minWidth: 170 }}>{suppCell(s, 'notes', { style: { fontStyle: 'italic' } })}</td>
                      <td style={{ ...td, width: 34 }}><button aria-label={`Remove ${s.name}`} onClick={() => removeSupp(s)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={15} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="supp-timings">{TIMINGS.map(t => <option key={t} value={t} />)}</datalist>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>Add to the stack</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SUPP_PRESETS.filter(p => !supps.some(s => s.name.toLowerCase() === p.name.toLowerCase())).map(p => (
                <button key={p.name} className="btn-ghost" onClick={() => addSupp(p)} style={{ padding: '6px 11px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> {p.name}</button>
              ))}
              <button className="btn" onClick={() => { const name = window.prompt('Supplement name'); if (name && name.trim()) addSupp({ name: name.trim() }) }} style={{ padding: '6px 12px', fontSize: 12.5 }}>+ Custom</button>
            </div>
            <p className="muted" style={{ fontSize: 11.5 }}>The client ticks these off each day in their app. Edit any cell and it saves when you click away. Supplements are optional — have clients check with a doctor before starting anything new, especially with medications or a health condition.</p>
          </div>
        </div>
      )}

      {tab === 'habits' && <CoachHabits clientId={clientId} onBusy={d => setBusy(b => b + d)} />}

      {tab === 'cardio' && <CoachCardio clientId={clientId} onBusy={d => setBusy(b => b + d)} />}

      {tab === 'bloodwork' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Tile label="Last test" value={tests.length ? fmtD(tests[tests.length - 1].test_date) : '—'} sub="most recent panel" />
            <Tile label="Markers tested" value={tested} sub="with a result" />
            <Tile label="In range" value={inRange} sub="within reference" accent />
            <Tile label="Flagged" value={flagged} sub="refer to doctor" warn={flagged > 0} />
          </div>

          <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Add a test</span>
            <input type="date" value={newTestDate} onChange={e => setNewTestDate(e.target.value)} style={{ maxWidth: 170, padding: '6px 8px' }} />
            <button className="btn" onClick={addTest} style={{ padding: '7px 14px', fontSize: 13 }}>+ Add test date</button>
            <span className="muted" style={{ fontSize: 12 }}>Then type the results into that column. The newest 4 tests show.</span>
            <label style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} style={{ width: 'auto' }} /> Only flagged
            </label>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left', paddingLeft: 12 }}>Marker</th><th style={th}>Unit</th><th style={th}>Low</th><th style={th}>High</th>
                  {shownTests.map(t => (
                    <th key={t.id} style={th}>
                      {fmtD(t.test_date)}
                      <button aria-label={`Delete test ${t.test_date}`} onClick={() => removeTest(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, color: '#000', fontSize: 11 }}>✕</button>
                    </th>
                  ))}
                  {shownTests.length === 0 && <th style={th}>Add a test →</th>}
                  <th style={th}>Latest</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'left' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(cat => {
                  const list = rows.filter(r => r.category === cat && (!onlyFlagged || r.status === 'HIGH' || r.status === 'LOW'))
                  if (!list.length) return null
                  return [
                    <tr key={cat}><td colSpan={8 + Math.max(shownTests.length, 1)} style={{ ...td, color: 'var(--orange-hot)', fontWeight: 800, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--steel)', padding: '7px 12px' }}>{cat}</td></tr>,
                    ...list.map(r => {
                      const bad = r.status === 'HIGH' || r.status === 'LOW'
                      return (
                        <tr key={r.name}>
                          <td style={{ ...td, paddingLeft: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.name}</td>
                          <td style={{ ...td, textAlign: 'center', color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.unit}</td>
                          <td style={{ ...td, width: 66 }}>{blurInput(`rl|${r.name}`, r.range.low ?? '', v => saveRange(r.name, 'ref_low', v), { label: `${r.name} low`, style: { color: r.range.custom ? 'var(--orange-hot)' : 'var(--muted)' } })}</td>
                          <td style={{ ...td, width: 66 }}>{blurInput(`rh|${r.name}`, r.range.high ?? '', v => saveRange(r.name, 'ref_high', v), { label: `${r.name} high`, style: { color: r.range.custom ? 'var(--orange-hot)' : 'var(--muted)' } })}</td>
                          {shownTests.map(t => {
                            const v = byMarker[r.name]?.byTest?.[t.id]
                            const st = v === undefined ? null : statusOf(v, r.range)
                            return <td key={t.id} style={{ ...td, width: 90 }}>{blurInput(`v|${t.id}|${r.name}`, v ?? '', val => saveResult(t, r.name, val), { label: `${r.name} ${t.test_date}`, style: { color: st === 'HIGH' || st === 'LOW' ? '#ff4d4d' : 'var(--white)', fontWeight: st === 'HIGH' || st === 'LOW' ? 800 : 500 } })}</td>
                          })}
                          {shownTests.length === 0 && <td style={td} />}
                          <td style={{ ...td, textAlign: 'center', fontWeight: 800, fontSize: 14 }}>{r.latest ? r.latest.value : ''}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            {r.status && <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 8px', borderRadius: 6, background: bad ? '#7a1f1f' : 'transparent', color: bad ? '#fff' : 'var(--orange-hot)' }}>{r.status}</span>}
                          </td>
                          <td style={{ ...td, fontSize: 11.5, fontStyle: 'italic', color: 'var(--muted)', minWidth: 160 }}>{MARKER_NOTES[r.name] || (r.range.custom ? `Lab range ${fmtRange(r.range)}` : '')}</td>
                        </tr>
                      )
                    }),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11.5 }}>
            For tracking only, not diagnosis. Grey ranges are common adult male defaults — type the range from the client's lab report into Low/High and it turns orange (saved for this client only). Refer anything flagged to the client's doctor.
          </p>
        </div>
      )}
    </div>
  )
}
