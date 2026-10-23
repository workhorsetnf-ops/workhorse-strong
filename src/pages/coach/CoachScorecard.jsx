import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localDateStr, logDate } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { TIERS, tierLabel, lastWeeks, weekDays, weekStartOf, expectedSessions, scoreWeek, suggestTier, weeklyCheckinFor, quickDone } from '../../lib/adherence'
import Avatar from '../Avatar'

const WEEKS = 4
const BAND_STYLE = {
  green: { background: 'rgba(46,160,67,0.18)', color: '#5fd17a', border: '1px solid rgba(46,160,67,0.5)' },
  yellow: { background: 'rgba(212,167,44,0.18)', color: '#f0c74f', border: '1px solid rgba(212,167,44,0.5)' },
  red: { background: 'rgba(218,54,51,0.18)', color: '#ff7b72', border: '1px solid rgba(218,54,51,0.5)' },
  none: { background: 'var(--steel)', color: 'var(--muted)', border: '1px solid var(--line)' },
}
const fmtShort = d => new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })

// PostgREST caps a response at 1,000 rows; set-level workout logs blow past that.
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error || !data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export default function CoachScorecard() {
  const today = localDateStr()
  const weeks = lastWeeks(today, WEEKS)
  const since = weeks[0]
  const [clients, setClients] = useState(null)
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(null)

  async function load() {
    const { data: cl } = await supabase.from('profiles')
      .select('id, full_name, avatar_url, status, adherence_tier, tier_since, start_date, checkin_day, checkin_frequency')
      .eq('role', 'client').eq('status', 'active').order('full_name')
    const ids = (cl || []).map(c => c.id)
    if (!ids.length) { setClients([]); setData({}); return }
    const [daily, meals, workouts, habits, ticks, checkins, { data: asg }] = await Promise.all([
      fetchAll(() => supabase.from('daily_logs').select('client_id, log_date, weight, sleep_hours, readiness, trained, nutrition_hit, quick_checkin_at, note').in('client_id', ids).gte('log_date', since).order('log_date').order('id')),
      fetchAll(() => supabase.from('meal_logs').select('client_id, logged_on').in('client_id', ids).gte('logged_on', since).order('logged_on').order('id')),
      fetchAll(() => supabase.from('workout_logs').select('client_id, logged_at, logged_date').in('client_id', ids).neq('session_track', 'conditioning').gte('logged_at', new Date(since + 'T00:00:00').toISOString()).order('logged_at').order('id')),
      fetchAll(() => supabase.from('client_habits').select('id, client_id, created_at').in('client_id', ids).eq('active', true).order('created_at').order('id')),
      fetchAll(() => supabase.from('habit_logs').select('client_id, habit_id, log_date').in('client_id', ids).gte('log_date', since).order('log_date').order('id')),
      fetchAll(() => supabase.from('checkins').select('client_id, submitted_at').in('client_id', ids).gte('submitted_at', new Date(addDays(since, -70) + 'T00:00:00').toISOString()).order('submitted_at').order('id')),
      supabase.from('program_assignments').select('*').in('client_id', ids),
    ])
    // programs: blocks, days, rotations for every assigned program
    const progIds = [...new Set((asg || []).map(a => a.program_id).filter(Boolean))]
    const { data: blocks } = progIds.length ? await supabase.from('program_blocks').select('*').in('program_id', progIds).order('position') : { data: [] }
    const blockIds = (blocks || []).map(b => b.id)
    const [days, rots] = blockIds.length ? await Promise.all([
      fetchAll(() => supabase.from('program_days').select('*').in('block_id', blockIds).order('id')),
      fetchAll(() => supabase.from('program_rotations').select('*').in('block_id', blockIds).order('position').order('id')),
    ]) : [[], []]
    const group = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {})
    const daysByBlock = group(days, 'block_id'), rotationsByBlock = group(rots, 'block_id')
    const blocksByProg = group(blocks || [], 'program_id')

    const by = {}
    for (const id of ids) by[id] = { daily: {}, meal: new Set(), work: new Set(), habits: [], ticks: {}, checkins: [], prog: null }
    for (const r of daily) by[r.client_id].daily[r.log_date] = r
    for (const r of meals) by[r.client_id].meal.add(r.logged_on)
    for (const r of workouts) by[r.client_id].work.add(logDate(r))
    for (const r of habits) by[r.client_id].habits.push(r)
    for (const r of ticks) (by[r.client_id].ticks[r.log_date] ||= new Set()).add(r.habit_id)
    for (const r of checkins) by[r.client_id].checkins.push(localDateStr(new Date(r.submitted_at)))
    for (const a of asg || []) if (by[a.client_id]) by[a.client_id].prog = { assignment: a, blocks: blocksByProg[a.program_id] || [], daysByBlock, rotationsByBlock }
    setClients(cl || []); setData(by)
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const rows = useMemo(() => {
    if (!clients || !data) return []
    return clients.map(c => {
      const d = data[c.id]
      const scored = weeks.map(ws => {
        const days = weekDays(ws)
        if (c.start_date && c.start_date > days[6]) return { weekStart: ws, total: null, band: null, parts: [] }
        const habitIds = d.habits.filter(h => String(h.created_at).slice(0, 10) <= ws).map(h => h.id)
        return {
          weekStart: ws,
          ...scoreWeek({
            days, tier: c.adherence_tier, daily: d.daily, mealDates: d.meal, workoutDates: d.work,
            habitIds, habitTicks: d.ticks, expected: expectedSessions(d.prog, ws),
            weeklyCheckin: weeklyCheckinFor({ checkinDay: c.checkin_day, frequency: c.checkin_frequency, startDate: c.start_date }, d.checkins, ws),
          }),
        }
      })
      const real = scored.filter(w => w.total !== null)
      const last = real[real.length - 1] || null
      const thisWeek = weekDays(weekStartOf(today)).filter(x => x <= today)
      return {
        c, scored, last,
        suggestion: suggestTier({ tier: c.adherence_tier, tierSince: c.tier_since, startDate: c.start_date, weeks: real, today }),
        quickThisWeek: thisWeek.filter(x => quickDone(d.daily[x])).length,
        notes: Object.values(d.daily).filter(r => r.note && r.log_date >= addDays(today, -14)).sort((a, b) => b.log_date.localeCompare(a.log_date)),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, data])

  async function setTier(c, tier) {
    setSaving(c.id)
    const t = tier === '' ? null : Number(tier)
    await supabase.from('profiles').update({ adherence_tier: t, tier_since: t ? today : null }).eq('id', c.id)
    setClients(list => list.map(x => (x.id === c.id ? { ...x, adherence_tier: t, tier_since: t ? today : null } : x)))
    setSaving(null)
  }

  if (!clients) return <p className="muted">Scoring the last {WEEKS} weeks…</p>
  const counts = { green: 0, yellow: 0, red: 0 }
  rows.forEach(r => { if (r.last?.band) counts[r.last.band]++ })
  const shown = rows.filter(r => filter === 'all' ? true : filter === 'moves' ? !!r.suggestion : filter === 'tiered' ? !!r.c.adherence_tier : r.last?.band === filter)
    .sort((a, b) => (a.last?.total ?? 101) - (b.last?.total ?? 101))

  const chip = (k, label) => (
    <button key={k} className={filter === k ? 'btn' : 'btn-ghost'} onClick={() => setFilter(k)} style={{ padding: '6px 12px', fontSize: 12.5 }}>{label}</button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Accountability</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>Scorecard</h1>
        <p className="muted" style={{ fontSize: 13 }}>Every client scored out of 100 for each of the last {WEEKS} completed weeks (Mon–Sun), straight from what they logged. The trend matters more than any one number.</p>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {chip('all', `All ${rows.length}`)}
        {chip('red', `Red ${counts.red}`)}
        {chip('yellow', `Yellow ${counts.yellow}`)}
        {chip('green', `Green ${counts.green}`)}
        {chip('moves', `Tier moves ${rows.filter(r => r.suggestion).length}`)}
        {chip('tiered', `On a tier ${rows.filter(r => r.c.adherence_tier).length}`)}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <th style={{ padding: '10px 12px' }}>Client</th>
              <th style={{ padding: '10px 8px' }}>Tier</th>
              {weeks.map(w => <th key={w} style={{ padding: '10px 6px', textAlign: 'center' }}>{fmtShort(w)}</th>)}
              <th style={{ padding: '10px 12px' }}>Suggested</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ c, scored, suggestion, quickThisWeek }) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--line)', background: open === c.id ? 'var(--steel)' : undefined }}>
                <td style={{ padding: '10px 12px' }}>
                  <button onClick={() => setOpen(open === c.id ? null : c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                    <Avatar url={c.avatar_url} name={c.full_name} size={26} />
                    <span style={{ fontWeight: 700 }}>{c.full_name || 'Client'}</span>
                  </button>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <select value={c.adherence_tier ?? ''} disabled={saving === c.id} onChange={e => setTier(c, e.target.value)} style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}>
                    <option value="">Off</option>
                    {[3, 2, 1].map(t => <option key={t} value={t}>{t} · {TIERS[t].cadence}</option>)}
                  </select>
                  {c.adherence_tier && <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>{quickThisWeek} quick check-in{quickThisWeek === 1 ? '' : 's'} this week</div>}
                </td>
                {scored.map(w => (
                  <td key={w.weekStart} style={{ padding: '10px 6px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', minWidth: 40, padding: '4px 8px', borderRadius: 20, fontWeight: 800, fontSize: 13, ...BAND_STYLE[w.band || 'none'] }}>{w.total ?? '—'}</span>
                  </td>
                ))}
                <td style={{ padding: '10px 12px' }}>
                  {suggestion ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 12 }}><strong style={{ color: suggestion.to === 3 ? '#ff7b72' : '#5fd17a' }}>→ Tier {suggestion.to}</strong><div className="muted" style={{ fontSize: 11 }}>{suggestion.reason}</div></div>
                      <button className="btn-ghost" disabled={saving === c.id} onClick={() => setTier(c, suggestion.to)} style={{ padding: '4px 10px', fontSize: 12 }}>Apply</button>
                    </div>
                  ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (() => {
        const r = rows.find(x => x.c.id === open)
        if (!r) return null
        const w = r.last
        return (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 18 }}>{r.c.full_name} · week of {w ? fmtShort(w.weekStart) : '—'}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>{tierLabel(r.c.adherence_tier)}</span>
                <Link to={`/coach/logs/${r.c.id}`} className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>View logs</Link>
              </div>
            </div>
            {w ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                {w.parts.map(p => (
                  <div key={p.key} style={{ background: 'var(--coal)', borderRadius: 8, padding: '8px 10px', opacity: p.na ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800 }}>
                      <span>{p.label}</span><span>{p.na ? 'n/a' : `${Math.round(p.pts)} / ${p.max}`}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{p.detail}</div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No completed week to score yet.</p>}
            {r.notes.length > 0 && (
              <div>
                <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Their notes, last 2 weeks</div>
                {r.notes.map(n => <div key={n.log_date} style={{ fontSize: 13, marginBottom: 4 }}><span className="muted">{fmtShort(n.log_date)}:</span> {n.note}</div>)}
              </div>
            )}
          </div>
        )
      })()}

      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
        <strong>How it's scored:</strong> check-ins 20 (quick check-ins on a tier: Tier 3 needs 7, Tier 2 needs 3, Tier 1 needs 2; otherwise their regular check-in) · training 25 (sessions logged vs scheduled in their program) · nutrition logged 20 (days logged of 7) · habits 15 (days with every habit ticked, 6 = full) · sleep & recovery 10 (5 days = full) · weigh-ins 10 (2 = full).
        Anything that doesn't apply (no program, no habits, no check-in due) is left out and the rest scaled to 100. <strong>Green</strong> 85+ · <strong>Yellow</strong> 65–84 · <strong>Red</strong> under 65.
        Tier moves: Tier 3 → 2 after 2 Green weeks past Week 4 · Tier 2 → 1 after 4 Green weeks · any Red week → back to Tier 3. Suggestions only; nothing changes until you press Apply.
      </div>
    </div>
  )
}
