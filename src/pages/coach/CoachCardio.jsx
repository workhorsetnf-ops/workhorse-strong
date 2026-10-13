import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { ZONES, CARDIO_TYPES, WEEKDAYS, maxHR, zoneRanges, zoneText, planTotals, weeklyLogged } from '../../lib/cardio'
import { Tile } from './CoachHealth'

// Cardio tab on the coach Health page: zones, the weekly plan, and what the
// client actually logged (cardio minutes from their Daily Log).
export default function CoachCardio({ clientId, onBusy = () => {} }) {
  const [settings, setSettings] = useState(null)
  const [plan, setPlan] = useState([])
  const [daily, setDaily] = useState([])
  const [draft, setDraft] = useState({})

  async function load() {
    const since = localDateStr(new Date(Date.now() - 60 * 864e5))
    const [{ data: s }, { data: p }, { data: d }] = await Promise.all([
      supabase.from('client_cardio_settings').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_cardio_plan').select('*').eq('client_id', clientId).order('weekday'),
      supabase.from('daily_logs').select('log_date, cardio_min').eq('client_id', clientId).gte('log_date', since),
    ])
    setSettings(s || { client_id: clientId, zone2_target: 120, hiit_target: 1 })
    setPlan(p || []); setDaily(d || [])
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [clientId])

  async function saveSetting(field, raw) {
    const v = String(raw).trim() === '' ? null : Number(raw)
    if (v !== null && Number.isNaN(v)) return
    if (String(settings?.[field] ?? '') === String(v ?? '')) return
    const next = { ...settings, [field]: v ?? (field === 'zone2_target' ? 120 : field === 'hiit_target' ? 1 : null), updated_at: new Date().toISOString() }
    setSettings(next)
    onBusy(1)
    const { error } = await supabase.from('client_cardio_settings').upsert(next, { onConflict: 'client_id' })
    onBusy(-1)
    if (error) { alert('Save failed: ' + error.message); load() }
  }

  async function saveDay(weekday, field, raw) {
    const cur = plan.find(p => p.weekday === weekday) || { client_id: clientId, weekday }
    let v = field === 'minutes' ? (String(raw).trim() === '' ? null : Number(raw)) : raw
    if (field === 'minutes' && v !== null && Number.isNaN(v)) return
    if (field === 'zone' && v === '') v = null
    if (String(cur[field] ?? '') === String(v ?? '')) return
    const row = { ...cur, [field]: v }
    setPlan(list => [...list.filter(p => p.weekday !== weekday), row].sort((a, b) => a.weekday - b.weekday))
    onBusy(1)
    const { id, ...payload } = row
    const { error } = await supabase.from('client_cardio_plan').upsert(payload, { onConflict: 'client_id,weekday' })
    onBusy(-1)
    if (error) { alert('Save failed: ' + error.message); load() } else if (!cur.id) load()
  }

  const blurInput = (key, value, onSave, opts = {}) => (
    <input value={key in draft ? draft[key] : String(value ?? '')} placeholder={opts.ph} inputMode={opts.mode} list={opts.list} aria-label={opts.label}
      onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
      onBlur={() => { if (key in draft) { onSave(draft[key]); setDraft(d => { const n = { ...d }; delete n[key]; return n }) } }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ padding: '6px 8px', fontSize: 13, textAlign: opts.center ? 'center' : 'left', fontWeight: opts.bold ? 700 : 500, width: '100%', boxSizing: 'border-box', ...opts.style }} />
  )

  if (!settings) return <p className="muted">Loading…</p>
  const hr = maxHR(settings)
  const zones = zoneRanges(hr.bpm)
  const totals = planTotals(plan)
  const weeks = weeklyLogged(daily, 8)
  const thisWeek = weeks[weeks.length - 1]
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }
  const td = { padding: '4px 6px', borderTop: '1px solid var(--line)', fontSize: 13 }
  const todayIdx = (new Date().getDay() + 6) % 7

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Tile label="Zone 2 target / week" value={`${settings.zone2_target} min`} sub={`Planned: ${totals.zone2} min`} accent warn={totals.zone2 < settings.zone2_target} />
        <Tile label="HIIT target / week" value={settings.hiit_target} sub={`Planned: ${totals.hiit}`} />
        <Tile label="Logged this week" value={`${thisWeek.minutes} min`} sub={`of ${totals.total} planned`} />
        <Tile label="Max heart rate" value={hr.bpm ? `${hr.bpm} bpm` : '—'} sub={hr.source === 'known' ? 'Entered by coach' : hr.source === 'estimate' ? 'Estimated: 208 − 0.7 × age' : 'Add age or known max'} />
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {[['age', 'Age', 'e.g. 32'], ['max_hr', 'Known max HR (optional)', 'bpm'], ['zone2_target', 'Zone 2 minutes / week', '120'], ['hiit_target', 'HIIT sessions / week', '1']].map(([f, label, ph]) => (
          <div key={f}>
            <label className="muted" style={{ fontSize: 11.5 }}>{label}</label>
            {blurInput(`s|${f}`, settings[f], v => saveSetting(f, v), { ph, mode: 'numeric', center: true, bold: true, label })}
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="eyebrow" style={{ fontSize: 10, padding: '12px 12px 8px' }}>Heart-rate zones</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
          <thead><tr>{['Zone', 'Name', '% of max', 'Low', 'High', 'Feels like', 'Use for'].map(h => <th key={h} style={{ ...th, textAlign: ['Name', 'Feels like', 'Use for'].includes(h) ? 'left' : 'center' }}>{h}</th>)}</tr></thead>
          <tbody>
            {zones.map((z, i) => (
              <tr key={z.zone} style={{ background: i % 2 ? 'var(--steel)' : 'transparent' }}>
                <td style={{ ...td, textAlign: 'center', color: 'var(--orange-hot)', fontWeight: 800, fontSize: 15 }}>{z.zone}</td>
                <td style={{ ...td, fontWeight: 700 }}>{z.name}</td>
                <td style={{ ...td, textAlign: 'center' }} className="muted">{Math.round(z.lo * 100)}–{Math.round(z.hi * 100)}%</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{z.low ?? '—'}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{z.high ?? '—'}</td>
                <td style={td} className="muted">{z.feel}</td>
                <td style={td} className="muted">{z.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="eyebrow" style={{ fontSize: 10, padding: '12px 12px 8px' }}>Weekly plan</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
          <thead><tr>{['Day', 'Type', 'Modality', 'Minutes', 'Zone', 'HR target', 'Notes'].map(h => <th key={h} style={{ ...th, textAlign: ['Day', 'Type', 'Modality', 'Notes'].includes(h) ? 'left' : 'center' }}>{h}</th>)}</tr></thead>
          <tbody>
            {WEEKDAYS.map((day, wd) => {
              const r = plan.find(p => p.weekday === wd) || {}
              return (
                <tr key={day} style={{ background: wd === todayIdx ? 'rgba(255,106,0,0.08)' : wd % 2 ? 'var(--steel)' : 'transparent' }}>
                  <td style={{ ...td, fontWeight: 800, color: wd === todayIdx ? 'var(--orange-hot)' : 'var(--white)', whiteSpace: 'nowrap', paddingLeft: 12 }}>{day.toUpperCase()}</td>
                  <td style={{ ...td, width: 140 }}>{blurInput(`p|${wd}|t`, r.cardio_type, v => saveDay(wd, 'cardio_type', v.trim()), { list: 'cardio-types', ph: 'Type', label: `${day} type`, style: { color: 'var(--orange-hot)', fontWeight: 700 } })}</td>
                  <td style={{ ...td, minWidth: 180 }}>{blurInput(`p|${wd}|m`, r.modality, v => saveDay(wd, 'modality', v.trim()), { ph: 'e.g. Incline walk', label: `${day} modality` })}</td>
                  <td style={{ ...td, width: 80 }}>{blurInput(`p|${wd}|min`, r.minutes, v => saveDay(wd, 'minutes', v), { mode: 'numeric', center: true, bold: true, label: `${day} minutes` })}</td>
                  <td style={{ ...td, width: 80 }}>
                    <select value={r.zone || ''} onChange={e => saveDay(wd, 'zone', e.target.value)} aria-label={`${day} zone`} style={{ padding: '6px 4px', fontSize: 13, fontWeight: 700, color: 'var(--orange-hot)' }}>
                      <option value="">—</option>{ZONES.map(z => <option key={z.zone} value={z.zone}>{z.zone}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>{r.zone ? zoneText(r.zone, hr.bpm) || r.zone : ''}</td>
                  <td style={{ ...td, minWidth: 180 }}>{blurInput(`p|${wd}|n`, r.notes, v => saveDay(wd, 'notes', v.trim()), { ph: '', label: `${day} notes`, style: { fontStyle: 'italic' } })}</td>
                </tr>
              )
            })}
            <tr>
              <td colSpan={3} style={{ ...td, fontWeight: 800, color: 'var(--orange-hot)', paddingLeft: 12, background: 'var(--steel)' }}>PLANNED THIS WEEK</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: 'var(--orange-hot)', background: 'var(--steel)' }}>{totals.total} min</td>
              <td colSpan={3} style={{ ...td, background: 'var(--steel)', fontWeight: 700 }}>Zone 2: {totals.zone2} min · HIIT: {totals.hiit}</td>
            </tr>
          </tbody>
        </table>
        <datalist id="cardio-types">{CARDIO_TYPES.map(t => <option key={t} value={t} />)}</datalist>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <div className="eyebrow" style={{ fontSize: 10, padding: '12px 12px 8px' }}>Cardio logged (from their Daily Log)</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
          <thead><tr>{['Week of', 'Minutes logged', 'Days logged', 'vs plan'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {weeks.slice().reverse().map((w, i) => {
              const pct = totals.total ? Math.round((w.minutes / totals.total) * 100) : null
              return (
                <tr key={w.monday} style={{ background: i % 2 ? 'var(--steel)' : 'transparent' }}>
                  <td style={{ ...td, textAlign: 'center' }}>{i === 0 ? 'This week' : new Date(w.monday + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 800 }}>{w.minutes}</td>
                  <td style={{ ...td, textAlign: 'center' }} className="muted">{w.daysLogged}/7</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: pct === null ? 'var(--muted)' : pct >= 100 ? 'var(--orange-hot)' : i === 0 ? 'var(--white)' : 'var(--red)' }}>{pct === null ? '—' : `${pct}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>Zones use a known max HR when you enter one, otherwise 208 − 0.7 × age. Logged minutes come from the cardio box in the client's Daily Log; past weeks under the plan show red.</p>
    </div>
  )
}
