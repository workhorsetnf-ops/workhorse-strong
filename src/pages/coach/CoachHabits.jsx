import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { HABIT_PRESETS, monthOf, monthDays, shiftMonth, monthLabel, dayLetter, monthStats, perfectStreak, pctText, pctColor } from '../../lib/habits'
import { Tile } from './CoachHealth'

// The month grid from the sheet: habits down the side, days across, a % per
// habit at the end and a daily % row along the bottom. Pass onToggle to make
// past/today cells tappable (client); leave it out for a read-only view (coach).
export function HabitGrid({ habits, days, stats, today, onToggle, compact, nameCell }) {
  const cw = compact ? 26 : 28
  const th = { fontSize: 10, fontWeight: 800, color: '#000', background: 'var(--orange)', padding: '4px 0', textAlign: 'center', minWidth: cw, lineHeight: 1.15 }
  const td = { borderTop: '1px solid var(--line)', padding: 1, textAlign: 'center' }
  const sticky = { position: 'sticky', left: 0, zIndex: 1 }
  // open with today in view (late in the month it's off-screen on a phone)
  const box = useRef(null)
  const month = days[0]
  useEffect(() => {
    const el = box.current, t = el?.querySelector('[data-today]')
    if (el && t) el.scrollLeft = Math.max(0, t.offsetLeft - el.clientWidth / 2)
  }, [month])
  return (
    <div ref={box} style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, ...sticky, textAlign: 'left', padding: '4px 10px', minWidth: compact ? 108 : 200, fontSize: 10.5, letterSpacing: '.06em' }}>HABIT</th>
            {days.map(d => (
              <th key={d} data-today={d === today ? '' : undefined} style={{ ...th, background: d === today ? 'var(--white)' : 'var(--orange)' }}>
                <div style={{ fontSize: 8.5, opacity: 0.7 }}>{dayLetter(d)}</div>{+d.slice(8)}
              </th>
            ))}
            <th style={{ ...th, padding: '4px 8px', fontSize: 10.5 }}>%</th>
          </tr>
        </thead>
        <tbody>
          {habits.map((h, i) => {
            const ph = stats.perHabit[h.id]
            const bg = i % 2 ? 'var(--steel)' : 'var(--coal)'
            return (
              <tr key={h.id}>
                <td style={{ ...td, ...sticky, background: bg, textAlign: 'left', padding: '2px 8px', fontSize: 12.5, fontWeight: 700, maxWidth: compact ? 108 : 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nameCell ? nameCell(h) : h.name}
                </td>
                {days.map(d => {
                  const on = stats.done.has(`${h.id}|${d}`)
                  const future = d > today
                  const box = { width: cw - 4, height: cw - 4, borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, padding: 0,
                    background: on ? 'var(--orange)' : 'transparent', color: '#000', border: '1px solid ' + (on ? 'var(--orange)' : d === today ? 'var(--white)' : 'var(--line)'), opacity: future ? 0.25 : 1 }
                  return (
                    <td key={d} style={{ ...td, background: bg }}>
                      {onToggle && !future
                        ? <button type="button" aria-label={`${h.name} ${d}`} aria-pressed={on} onClick={() => onToggle(h, d)} style={{ ...box, cursor: 'pointer' }}>{on ? '✓' : ''}</button>
                        : <span style={box}>{on ? '✓' : ''}</span>}
                    </td>
                  )
                })}
                <td style={{ ...td, background: bg, padding: '2px 8px', fontWeight: 800, fontSize: 13, color: pctColor(ph?.pct) }}>{pctText(ph?.pct)}</td>
              </tr>
            )
          })}
          <tr>
            <td style={{ ...td, ...sticky, background: 'var(--black, #000)', textAlign: 'left', padding: '6px 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--orange-hot)' }}>DAILY %</td>
            {days.map(d => {
              const p = stats.perDay[d]
              return <td key={d} style={{ ...td, background: 'var(--black, #000)', fontSize: 9.5, fontWeight: 800, color: pctColor(p), padding: '6px 0' }}>{p === null ? '' : Math.round(p * 100)}</td>
            })}
            <td style={{ ...td, background: 'var(--orange)', color: '#000', fontWeight: 900, fontSize: 13, padding: '6px 8px' }}>{pctText(stats.overall)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function CoachHabits({ clientId, onBusy }) {
  const today = localDateStr()
  const [month, setMonth] = useState(monthOf(today))
  const [habits, setHabits] = useState([])
  const [logs, setLogs] = useState([])
  const [streakLogs, setStreakLogs] = useState([])
  const [library, setLibrary] = useState([])
  const [draft, setDraft] = useState({})
  const [missing, setMissing] = useState(false)
  const days = monthDays(month)

  async function load() {
    const [{ data: h, error }, { data: l }, { data: s }] = await Promise.all([
      supabase.from('client_habits').select('*').eq('client_id', clientId).eq('active', true).order('position').order('created_at'),
      supabase.from('habit_logs').select('habit_id, log_date').eq('client_id', clientId).gte('log_date', days[0]).lte('log_date', days[days.length - 1]),
      supabase.from('habit_logs').select('habit_id, log_date').eq('client_id', clientId).lte('log_date', today).order('log_date', { ascending: false }).limit(2000),
    ])
    setMissing(!!error && /client_habits/.test(error.message || ''))
    setHabits(h || []); setLogs(l || []); setStreakLogs(s || [])
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, month])
  useEffect(() => { supabase.from('lifestyle_library').select('name, category').order('name').then(({ data }) => setLibrary(data || [])) }, [])

  async function run(fn) { onBusy?.(1); try { await fn() } finally { onBusy?.(-1) } }

  async function add(preset) {
    await run(async () => {
      const { error } = await supabase.from('client_habits').insert({ client_id: clientId, position: habits.length, name: preset.name, target: preset.target || '' })
      if (error) alert(/client_habits/.test(error.message) ? 'Run the Update 92 SQL in Supabase first.' : 'Could not add: ' + error.message)
      await load()
    })
  }
  async function patch(id, field, value) {
    const cur = habits.find(h => h.id === id)
    if (!cur || String(cur[field] ?? '') === value) return
    if (field === 'name' && !value) return
    setHabits(list => list.map(h => (h.id === id ? { ...h, [field]: value } : h)))
    await run(async () => {
      const { error } = await supabase.from('client_habits').update({ [field]: value }).eq('id', id)
      if (error) { alert('Save failed: ' + error.message); load() }
    })
  }
  async function move(h, dir) {
    const i = habits.findIndex(x => x.id === h.id), j = i + dir
    if (j < 0 || j >= habits.length) return
    const list = [...habits];[list[i], list[j]] = [list[j], list[i]]
    setHabits(list)
    await run(async () => { await Promise.all(list.map((x, k) => supabase.from('client_habits').update({ position: k }).eq('id', x.id))) })
  }
  async function remove(h) {
    if (!window.confirm(`Remove "${h.name}"? Its tick history goes too.`)) return
    await run(async () => { await supabase.from('client_habits').delete().eq('id', h.id); await load() })
  }

  const cell = (h, field, ph) => {
    const key = `${h.id}|${field}`
    return (
      <input value={key in draft ? draft[key] : String(h[field] ?? '')} placeholder={ph} aria-label={`${h.name} ${field}`}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        onBlur={() => { if (key in draft) { patch(h.id, field, String(draft[key]).trim()); setDraft(d => { const n = { ...d }; delete n[key]; return n }) } }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ padding: '6px 8px', fontSize: 13, fontWeight: field === 'name' ? 700 : 500, color: field === 'target' ? 'var(--orange-hot)' : undefined }} />
    )
  }

  const stats = monthStats(habits, logs, days, today)
  const scored = habits.map(h => ({ h, p: stats.perHabit[h.id]?.pct })).filter(x => x.p !== null && x.p !== undefined)
  const best = scored.length ? scored.reduce((a, b) => (b.p > a.p ? b : a)) : null
  const worst = scored.length > 1 ? scored.reduce((a, b) => (b.p < a.p ? b : a)) : null
  const streak = month === monthOf(today) ? perfectStreak(habits, streakLogs, today) : null
  const have = new Set(habits.map(h => h.name.toLowerCase()))
  const chips = [...HABIT_PRESETS, ...library.map(l => ({ name: l.name, target: '' }))]
    .filter((p, i, a) => !have.has(p.name.toLowerCase()) && a.findIndex(x => x.name.toLowerCase() === p.name.toLowerCase()) === i)

  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#000', background: 'var(--orange)', padding: '8px 6px', textAlign: 'left' }
  const td = { padding: '4px 6px', borderTop: '1px solid var(--line)', verticalAlign: 'middle' }

  if (missing) return <div className="card" style={{ color: 'var(--red)' }}>Habits need the Update 92 SQL (migration_update92_habits.sql) run in Supabase first.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Tile label="Month score" value={pctText(stats.overall)} sub={monthLabel(month)} accent warn={stats.overall !== null && stats.overall < 0.5} />
        <Tile label="Perfect-day streak" value={streak === null ? '—' : streak} sub="every habit ticked" />
        <Tile label="Strongest" value={best ? pctText(best.p) : '—'} sub={best ? best.h.name : 'no data yet'} />
        <Tile label="Needs work" value={worst ? pctText(worst.p) : '—'} sub={worst ? worst.h.name : '—'} warn={!!worst && worst.p < 0.5} />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
          <button className="btn-ghost" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} style={{ padding: '4px 8px' }}><ChevronLeft size={15} /></button>
          <strong style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '.04em', minWidth: 150, textAlign: 'center' }}>{monthLabel(month)}</strong>
          <button className="btn-ghost" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} style={{ padding: '4px 8px' }}><ChevronRight size={15} /></button>
          {month !== monthOf(today) && <button className="btn-ghost" onClick={() => setMonth(monthOf(today))} style={{ padding: '4px 10px', fontSize: 12 }}>This month</button>}
          <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>Client ticks these in their app. Days before a habit was added don't count.</span>
        </div>
        {habits.length
          ? <HabitGrid habits={habits} days={days} stats={stats} today={today} />
          : <p className="muted" style={{ padding: '0 12px 14px', fontSize: 13 }}>No habits yet. Add some below.</p>}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead><tr><th style={{ ...th, paddingLeft: 12 }}>Habit</th><th style={th}>Target</th><th style={{ ...th, textAlign: 'center' }}>Order</th><th style={th} /></tr></thead>
          <tbody>
            {habits.map((h, i) => (
              <tr key={h.id} style={{ background: i % 2 ? 'var(--steel)' : 'transparent' }}>
                <td style={{ ...td, paddingLeft: 10, minWidth: 220 }}>{cell(h, 'name')}</td>
                <td style={{ ...td, minWidth: 160 }}>{cell(h, 'target', 'e.g. 10k+')}</td>
                <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn-ghost" aria-label={`Move ${h.name} up`} disabled={i === 0} onClick={() => move(h, -1)} style={{ padding: '2px 8px' }}>↑</button>
                  <button className="btn-ghost" aria-label={`Move ${h.name} down`} disabled={i === habits.length - 1} onClick={() => move(h, 1)} style={{ padding: '2px 8px', marginLeft: 4 }}>↓</button>
                </td>
                <td style={{ ...td, width: 34 }}><button aria-label={`Remove ${h.name}`} onClick={() => remove(h)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>Add a habit</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map(p => (
              <button key={p.name} className="btn-ghost" onClick={() => add(p)} style={{ padding: '6px 11px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> {p.name}</button>
            ))}
            <button className="btn" onClick={() => { const name = window.prompt('Habit name'); if (name && name.trim()) add({ name: name.trim() }) }} style={{ padding: '6px 12px', fontSize: 12.5 }}>+ Custom</button>
          </div>
          <p className="muted" style={{ fontSize: 11.5 }}>Your Lifestyle library items show here too. Edit a name or target and it saves when you click away.</p>
        </div>
      </div>
    </div>
  )
}
