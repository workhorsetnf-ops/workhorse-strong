import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom } from '../../lib/weeks'
import { weekOfCoaching, nextCheckin, macroRows, progress, sessionsOn, DEFAULT_TODOS, weekCompletion, heightText, WEEKDAYS, mondayIndex } from '../../lib/dashboard'

const ANTON = "'Anton','Barlow Condensed',system-ui,sans-serif"
const fmtDate = (d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, opts) : '—')

function Tile({ label, value, sub, accent, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined, background: 'var(--coal)', border: '1px solid var(--line)', borderTop: '3px solid var(--orange)', borderRadius: 10, padding: '10px 8px', textAlign: 'center', minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: ANTON, fontSize: wide ? 34 : 24, lineHeight: 1.15, marginTop: 3, color: accent ? 'var(--orange-hot)' : 'var(--white)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

const row = i => ({ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: i % 2 ? 'var(--steel)' : 'var(--coal)', fontSize: 13.5 })
const lab = { color: 'var(--muted)', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', alignSelf: 'center' }

export default function ClientDashboard({ profile }) {
  const today = localDateStr()
  const days = weekDaysFrom(mondayOf(today))
  const [me, setMe] = useState(profile)
  const [weights, setWeights] = useState([])
  const [checkins, setCheckins] = useState({ count: 0, last: null })
  const [prog, setProg] = useState(null)        // { start, blocks, daysByBlock }
  const [todos, setTodos] = useState([])
  const [ticks, setTicks] = useState([])
  const [editTodos, setEditTodos] = useState(false)
  const [newTodo, setNewTodo] = useState('')
  const [todoMissing, setTodoMissing] = useState(false)
  const [coachName, setCoachName] = useState('')

  async function loadTodos() {
    const [{ data: t, error }, { data: k }] = await Promise.all([
      supabase.from('client_todos').select('*').eq('client_id', profile.id).order('position').order('created_at'),
      supabase.from('client_todo_ticks').select('todo_id, log_date').eq('client_id', profile.id).gte('log_date', days[0]).lte('log_date', days[6]),
    ])
    if (error) { setTodoMissing(true); return }
    if (!t?.length) {
      // first visit: start them on the sheet's to-do list
      await supabase.from('client_todos').insert(DEFAULT_TODOS.map((label, i) => ({ client_id: profile.id, label, position: i })))
      const { data: seeded } = await supabase.from('client_todos').select('*').eq('client_id', profile.id).order('position')
      setTodos(seeded || [])
    } else setTodos(t)
    setTicks(k || [])
  }

  useEffect(() => {
    if (!profile) return
    supabase.from('profiles').select('*').eq('id', profile.id).single().then(({ data }) => data && setMe(data))
    supabase.from('daily_logs').select('log_date, weight').eq('client_id', profile.id).not('weight', 'is', null).order('log_date')
      .then(({ data }) => setWeights((data || []).filter(d => d.weight)))
    supabase.from('checkins').select('submitted_at').eq('client_id', profile.id).order('submitted_at', { ascending: false })
      .then(({ data }) => setCheckins({ count: (data || []).length, last: data?.[0]?.submitted_at ? localDateStr(new Date(data[0].submitted_at)) : null }))
    supabase.from('program_assignments').select('program_id, start_date').eq('client_id', profile.id).maybeSingle().then(async ({ data }) => {
      if (!data) { setProg({ start: null, blocks: [], daysByBlock: {} }); return }
      const { data: blocks } = await supabase.from('program_blocks').select('*').eq('program_id', data.program_id).order('position')
      const { data: pdays } = await supabase.from('program_days').select('*').eq('program_id', data.program_id).order('day_number').order('position')
      const daysByBlock = {}
      for (const d of pdays || []) (daysByBlock[d.block_id] = daysByBlock[d.block_id] || []).push(d)
      setProg({ start: data.start_date, blocks: blocks || [], daysByBlock })
    })
    supabase.from('profiles').select('full_name').eq('role', 'coach').limit(1).then(({ data }) => setCoachName(data?.[0]?.full_name || ''))
    loadTodos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function toggleTick(t, d) {
    if (d > today) return
    const on = ticks.some(k => k.todo_id === t.id && k.log_date === d)
    setTicks(list => (on ? list.filter(k => !(k.todo_id === t.id && k.log_date === d)) : [...list, { todo_id: t.id, log_date: d }]))
    const { error } = on
      ? await supabase.from('client_todo_ticks').delete().eq('todo_id', t.id).eq('log_date', d)
      : await supabase.from('client_todo_ticks').insert({ client_id: profile.id, todo_id: t.id, log_date: d })
    if (error) loadTodos()
  }
  async function addTodo(e) {
    e.preventDefault()
    const label = newTodo.trim()
    if (!label) return
    setNewTodo('')
    await supabase.from('client_todos').insert({ client_id: profile.id, label, position: todos.length })
    loadTodos()
  }
  async function removeTodo(t) {
    if (!window.confirm(`Remove "${t.label}" from your to-do list?`)) return
    await supabase.from('client_todos').delete().eq('id', t.id)
    loadTodos()
  }

  const start = me?.start_date || prog?.start || null
  const startW = weights[0]?.weight ?? null
  const curW = weights[weights.length - 1]?.weight ?? null
  const goalW = me?.target_weight != null ? Number(me.target_weight) : null
  const macros = macroRows(me, curW)
  const kcal = Number(me?.calories) || macros.total.kcal
  const pr = progress(startW, curW, goalW)
  const wk = weekOfCoaching(start, today)
  const next = nextCheckin({ checkinDay: me?.checkin_day, lastCheckin: checkins.last, start, today })
  const done = weekCompletion(todos, ticks, days)
  const sgn = n => (n > 0 ? `+${n}` : `${n}`)
  const tickSet = new Set(ticks.map(k => `${k.todo_id}|${k.log_date}`))

  const profileRows = [
    ['Age', me?.age ?? '—'], ['Height', heightText(me?.height_in)], ['Start date', fmtDate(start)], ['Goal', me?.goal || '—'],
    ['Steps target', me?.steps_target ? Number(me.steps_target).toLocaleString() : '—'], ['Water target', me?.water_oz ? `${me.water_oz} oz` : '—'],
    ['Coach', coachName || '—'], ['Limitations', me?.limitations || '—'],
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Tile wide accent label="Week of coaching" value={wk ? `Week ${wk}` : '—'} sub={start ? `Started ${fmtDate(start)}` : 'Start date not set yet'} />
        <Tile accent label="Daily calories" value={kcal ? kcal.toLocaleString() : '—'} sub="kcal per day" />
        <Tile label="Current weight" value={curW != null ? `${curW} lb` : '—'} sub={pr.change != null ? `${sgn(pr.change)} lb since start` : 'Log your weight'} />
        <Tile label="Phase" value={String(me?.phase || '—').toUpperCase()} sub={`${checkins.count} check-in${checkins.count === 1 ? '' : 's'} logged`} />
        <Tile label="Next check-in" value={next ? fmtDate(next, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'} sub={me?.checkin_day != null ? `Every ${WEEKDAYS[me.checkin_day]}` : 'Weekly'} />
      </div>

      <Section title="This week's to-do" right={<span className="muted" style={{ fontSize: 11, fontWeight: 800 }}>WEEK OF {fmtDate(days[0], { month: 'short', day: 'numeric' }).toUpperCase()}</span>}>
        {todoMissing ? <p className="muted" style={{ fontSize: 12.5 }}>Your coach is still setting this up.</p> : <>
          <div style={{ overflowX: 'auto', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 800, padding: '4px 6px', letterSpacing: '.08em' }}>TASK</th>
                  {days.map((d, i) => (
                    <th key={d} style={{ fontSize: 10, fontWeight: 900, padding: '4px 0', width: 30, borderRadius: 4, background: d === today ? 'var(--orange)' : 'transparent', color: d === today ? '#000' : 'var(--muted)' }}>{'MTWTFSS'[i]}</th>
                  ))}
                  <th style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800, padding: '4px 4px', width: 34 }}>{editTodos ? '' : 'DONE'}</th>
                </tr>
              </thead>
              <tbody>
                {todos.map((t, i) => {
                  const n = days.filter(d => tickSet.has(`${t.id}|${d}`)).length
                  return (
                    <tr key={t.id} style={{ background: i % 2 ? 'var(--steel)' : 'var(--coal)' }}>
                      <td style={{ padding: '6px 6px', fontSize: 12.5, fontWeight: 700, borderLeft: '2px solid var(--orange)', lineHeight: 1.25 }}>{t.label}</td>
                      {days.map(d => {
                        const on = tickSet.has(`${t.id}|${d}`)
                        return (
                          <td key={d} style={{ textAlign: 'center', padding: '3px 1px' }}>
                            <button type="button" disabled={d > today} onClick={() => toggleTick(t, d)} aria-label={`${t.label} ${d}`} aria-pressed={on}
                              style={{ width: 26, height: 26, padding: 0, borderRadius: 6, fontWeight: 900, color: '#000', cursor: d > today ? 'default' : 'pointer', opacity: d > today ? 0.3 : 1,
                                background: on ? 'var(--orange)' : 'transparent', border: '1.5px solid ' + (on ? 'var(--orange)' : d === today ? 'var(--white)' : 'var(--line)') }}>{on ? '✓' : ''}</button>
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 900, color: 'var(--orange-hot)' }}>
                        {editTodos ? <button aria-label={`Remove ${t.label}`} onClick={() => removeTodo(t)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button> : `${n}/7`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '8px 10px', background: 'var(--steel)', borderRadius: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--orange-hot)', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>WEEK COMPLETION</span>
            <span style={{ fontWeight: 900, color: 'var(--orange-hot)', fontSize: 14 }}>{Math.round(done * 100)}%</span>
            <div style={{ flex: 1, height: 8, background: 'var(--coal)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${done * 100}%`, height: '100%', background: 'var(--orange)' }} /></div>
          </div>
          {editTodos && (
            <form onSubmit={addTodo} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={newTodo} onChange={e => setNewTodo(e.target.value)} placeholder="Add a task…" style={{ fontSize: 14 }} />
              <button className="btn" type="submit" style={{ padding: '6px 14px' }}>Add</button>
            </form>
          )}
          <button className="btn-ghost" onClick={() => setEditTodos(!editTodos)} style={{ alignSelf: 'flex-start', marginTop: 8, padding: '5px 12px', fontSize: 12 }}>{editTodos ? 'Done editing' : 'Edit tasks'}</button>
        </>}
      </Section>

      <Section title="Daily macros">
        <div style={{ borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', padding: '6px 10px', fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.06em' }}>
            <span>MACRO</span><span style={{ textAlign: 'center' }}>GRAMS</span><span style={{ textAlign: 'center' }}>KCAL</span><span style={{ textAlign: 'center' }}>% CAL</span><span style={{ textAlign: 'center' }}>G / LB</span>
          </div>
          {macros.rows.map((m, i) => (
            <div key={m.label} style={{ padding: '7px 10px', background: i % 2 ? 'var(--steel)' : 'var(--coal)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', fontSize: 13.5, alignItems: 'center' }}>
                <strong style={{ color: ['var(--orange-hot)', 'var(--white)', 'var(--muted)'][i], textTransform: 'uppercase', fontSize: 13 }}>{m.label}</strong>
                <span style={{ textAlign: 'center', fontWeight: 800 }}>{m.g} g</span>
                <span style={{ textAlign: 'center' }}>{m.kcal.toLocaleString()}</span>
                <span style={{ textAlign: 'center' }}>{Math.round(m.pct * 100)}%</span>
                <span style={{ textAlign: 'center' }} className="muted">{m.perLb != null ? m.perLb.toFixed(2) : '—'}</span>
              </div>
              <div style={{ height: 5, marginTop: 5, background: 'var(--coal)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${m.pct * 100}%`, height: '100%', background: ['var(--orange)', 'var(--white)', 'var(--muted)'][i] }} /></div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', padding: '8px 10px', background: 'var(--steel)', borderTop: '1px solid var(--orange)', fontSize: 13.5, fontWeight: 900 }}>
            <span style={{ color: 'var(--orange-hot)' }}>TOTAL</span><span style={{ textAlign: 'center' }}>{macros.total.g} g</span><span style={{ textAlign: 'center', color: 'var(--orange-hot)' }}>{macros.total.kcal.toLocaleString()}</span><span style={{ textAlign: 'center' }}>100%</span><span />
          </div>
        </div>
        <Link to="/app/nutrition/plan" style={{ fontSize: 12, marginTop: 6, alignSelf: 'flex-start' }}>See your meal plan →</Link>
      </Section>

      <Section title="Weekly training split">
        <div style={{ borderRadius: 8, overflow: 'hidden' }}>
          {days.map((d, i) => {
            const s = prog ? sessionsOn(d, prog.start, prog.blocks, prog.daysByBlock) : []
            const isToday = d === today
            const rest = !s.length
            return (
              <div key={d} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, padding: '8px 10px', alignItems: 'center',
                background: isToday ? 'var(--orange)' : i % 2 ? 'var(--steel)' : 'var(--coal)', color: isToday ? '#000' : undefined }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '.06em' }}>{WEEKDAYS[mondayIndex(d)].slice(0, 3).toUpperCase()}</span>
                <span style={{ fontSize: 13.5, fontWeight: rest ? 500 : 800, fontStyle: rest ? 'italic' : 'normal', color: isToday ? '#000' : rest ? 'var(--muted)' : 'var(--orange-hot)' }}>
                  {rest ? 'Rest' : s.map(x => x.day_label).join(' + ')}
                </span>
              </div>
            )
          })}
        </div>
        <span className="muted" style={{ fontSize: 11, marginTop: 6 }}>Today's session is highlighted in orange.</span>
      </Section>

      <Section title="Progress">
        <div style={{ borderRadius: 8, overflow: 'hidden' }}>
          {[['Start weight', startW != null ? `${startW} lb` : '—'], ['Current weight', curW != null ? `${curW} lb` : '—'], ['Goal weight', goalW != null ? `${goalW} lb` : '—', true],
            ['Total change', pr.change != null ? `${sgn(pr.change)} lb` : '—'], ['Left to go', pr.left != null ? `${pr.left} lb` : '—']].map(([l, v, acc], i) => (
            <div key={l} style={row(i)}><span style={lab}>{l}</span><strong style={{ color: acc ? 'var(--orange-hot)' : undefined }}>{v}</strong></div>
          ))}
          <div style={{ padding: '10px 10px', background: 'var(--coal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={lab}>Progress to goal</span><strong style={{ color: 'var(--orange-hot)', fontSize: 16 }}>{pr.pct != null ? `${Math.round(pr.pct * 100)}%` : '—'}</strong></div>
            <div style={{ height: 10, marginTop: 6, background: 'var(--steel)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${(pr.pct || 0) * 100}%`, height: '100%', background: 'var(--orange)' }} /></div>
          </div>
        </div>
      </Section>

      <Section title="Client profile">
        <div style={{ borderRadius: 8, overflow: 'hidden' }}>
          {profileRows.map(([l, v], i) => <div key={l} style={row(i)}><span style={lab}>{l}</span><span style={{ textAlign: 'right', fontWeight: 600 }}>{v}</span></div>)}
        </div>
      </Section>
    </div>
  )
}
