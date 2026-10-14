import { useEffect, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, mondayOf, weekDaysFrom, logDate, summarizeWeek } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { targetsFrom } from '../../lib/mealplan'
import { weekTable } from '../../lib/foodlog'
import { monthStats } from '../../lib/habits'
import { photoRows } from '../../lib/measurements'
import { buildReview } from '../../lib/review'
import { WeekTotals } from './FoodLogViews'
import { HabitGrid } from './CoachHabits'
import { WeekTable } from '../client/ClientProgress'

const DISPLAY_FONT = "'Oswald','Barlow',system-ui,sans-serif"
const COLORS = { good: 'var(--orange)', ok: '#c9a227', bad: '#e5484d' }
const WORD = { good: 'ON TRACK', ok: 'CLOSE', bad: 'NEEDS WORK' }
const md = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const r0 = v => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString())
const pct = v => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`)

function Tile({ label, value, sub, grade, to }) {
  const inner = (
    <div style={{ background: 'var(--coal)', border: '1px solid var(--line)', borderTop: `4px solid ${grade ? COLORS[grade] : 'var(--line)'}`, borderRadius: 10, padding: '10px 10px', minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</span>
        {grade && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.06em', color: COLORS[grade] }}>{WORD[grade]}</span>}
      </div>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 28, lineHeight: 1.15, marginTop: 4 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{sub}</div>}
    </div>
  )
  return to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner
}

function Section({ title, right, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '3px solid var(--orange)', paddingBottom: 4, marginBottom: 8 }}>
        <span style={{ color: 'var(--orange-hot)', fontWeight: 900, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase' }}>{title}</span>{right}
      </div>
      {children}
    </div>
  )
}

export default function CoachReview() {
  const { clientId } = useParams()
  const [params, setParams] = useSearchParams()
  const today = localDateStr()
  const monday = mondayOf(params.get('week') || today)
  const days = weekDaysFrom(monday)
  const prevDays = weekDaysFrom(addDays(monday, -7))
  const [data, setData] = useState(null)
  const [urls, setUrls] = useState({})

  useEffect(() => {
    let live = true
    setData(null)
    ;(async () => {
      const q = (t, sel = '*') => supabase.from(t).select(sel).eq('client_id', clientId)
      const [me, daily, wl, asg, meals, plan, habits, hlogs, supps, slogs, cplan, ms, cks] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', clientId).single(),
        q('daily_logs').gte('log_date', prevDays[0]).lte('log_date', days[6]),
        q('workout_logs', 'logged_at, logged_date').gte('logged_at', new Date(prevDays[0] + 'T00:00:00').toISOString()),
        supabase.from('program_assignments').select('program_id, start_date').eq('client_id', clientId).maybeSingle(),
        q('meal_logs').gte('logged_on', days[0]).lte('logged_on', days[6]),
        supabase.from('meal_plans').select('*').eq('client_id', clientId).maybeSingle(),
        q('client_habits').eq('active', true).order('position'),
        q('habit_logs', 'habit_id, log_date').gte('log_date', days[0]).lte('log_date', days[6]),
        q('client_supplements').eq('active', true),
        q('supplement_logs', 'supplement_id, log_date').gte('log_date', days[0]).lte('log_date', days[6]),
        q('client_cardio_plan'),
        q('body_measurements').order('log_date'),
        q('checkins').order('submitted_at'),
      ])
      let program = null
      if (asg.data) {
        const { data: blocks } = await supabase.from('program_blocks').select('*').eq('program_id', asg.data.program_id).order('position')
        const { data: pdays } = await supabase.from('program_days').select('*').eq('program_id', asg.data.program_id)
        const daysByBlock = {}
        for (const x of pdays || []) (daysByBlock[x.block_id] = daysByBlock[x.block_id] || []).push(x)
        program = { start: asg.data.start_date, blocks: blocks || [], daysByBlock }
      }
      const profile = me.data || {}
      const d = {
        days, prevDays, today, phase: profile.phase,
        daily: daily.data || [], workoutDates: new Set((wl.data || []).map(logDate)), program,
        mealLogs: meals.data || [], targets: targetsFrom(profile, plan.data),
        habits: habits.data || [], habitLogs: hlogs.data || [], supps: supps.data || [], suppLogs: slogs.data || [],
        cardioPlan: cplan.data || [], measurements: ms.data || [],
      }
      const review = buildReview(d)
      const photos = photoRows(cks.data || [], profile.start_date || null, localDateStr).filter(r => r.date <= days[6] && r.date >= addDays(days[0], -35))
      const shownPhotos = photos.slice(-2)
      const weekCheckin = (cks.data || []).filter(c => { const ld = localDateStr(new Date(c.submitted_at)); return ld >= days[0] && ld <= addDays(days[6], 2) }).pop() || null
      if (!live) return
      setData({ profile, d, review, photos: shownPhotos, weekCheckin })
      const map = {}
      for (const r of shownPhotos) for (const k of ['Front', 'Side', 'Back']) if (r[k]) {
        const { data: s } = await supabase.storage.from('checkin-photos').createSignedUrl(r[k], 3600)
        if (s?.signedUrl) map[r[k]] = s.signedUrl
      }
      if (live) setUrls(map)
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, monday])

  const go = n => setParams({ week: addDays(monday, 7 * n) })
  const isCurrent = monday === mondayOf(today)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <Link to="/coach/checkins" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}><ChevronLeft size={15} /> Check-ins</Link>
        <div className="eyebrow" style={{ marginTop: 6 }}>Weekly review</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 28, margin: '4px 0' }}>{data?.profile.full_name || 'Client'} <span style={{ color: 'var(--muted)', fontSize: 16 }}>· {String(data?.profile.phase || '').toUpperCase()}</span></h1>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn-ghost" aria-label="Previous week" onClick={() => go(-1)} style={{ padding: '5px 9px' }}><ChevronLeft size={15} /></button>
            <strong style={{ fontSize: 14, minWidth: 150, textAlign: 'center' }}>WEEK OF {md(days[0]).toUpperCase()}</strong>
            <button className="btn-ghost" aria-label="Next week" disabled={isCurrent} onClick={() => go(1)} style={{ padding: '5px 9px', opacity: isCurrent ? 0.35 : 1 }}><ChevronRight size={15} /></button>
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--orange)', borderRadius: 2, marginTop: 6 }} />
      </div>

      {!data && <p className="muted">Pulling the week together…</p>}
      {data && (() => {
        const { review: R, d, profile } = data
        const t = R.nutrition.targets
        return <>
          <div className="card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5 }}>
            <span><strong style={{ color: 'var(--orange-hot)' }}>Wins:</strong> {R.wins.length ? R.wins.join(', ') : '—'}</span>
            <span><strong style={{ color: '#e5484d' }}>Needs a word:</strong> {R.flags.length ? R.flags.join(', ') : 'nothing — solid week'}</span>
            {isCurrent && <span className="muted">Week in progress: today counts only once it's logged.</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 10 }}>
            <Tile label="Training" grade={R.training.grade} value={R.training.planned ? `${R.training.done} / ${R.training.planned}` : R.training.done}
              sub={R.training.planned ? 'sessions done / planned' : 'sessions logged (no program assigned)'} to={`/coach/logs/${clientId}`} />
            <Tile label="Nutrition" grade={R.nutrition.grade} value={R.nutrition.judged ? `${R.nutrition.onTarget} / ${R.nutrition.judged}` : `${R.nutrition.loggedDays} / 7`}
              sub={R.nutrition.judged ? `days on target · avg ${r0(R.nutrition.avgKcal)} kcal, ${r0(R.nutrition.avgP)} g P` : 'days with food logged'} to={`/coach/nutrition/${clientId}`} />
            {R.habits && <Tile label="Habits" grade={R.habits.grade} value={pct(R.habits.pct)} sub={R.habits.worst ? `Weakest: ${R.habits.worst.name} (${pct(R.habits.worst.pct)})` : 'this week'} to={`/coach/health/${clientId}`} />}
            {R.supplements && <Tile label="Supplements" grade={R.supplements.grade} value={pct(R.supplements.pct)} sub="doses taken" to={`/coach/health/${clientId}`} />}
            {R.cardio && <Tile label="Cardio" grade={R.cardio.grade} value={`${R.cardio.minutes} min`} sub={R.cardio.planned ? `of ${R.cardio.planned} planned` : 'logged'} to={`/coach/health/${clientId}`} />}
            <Tile label="Weight (avg)" grade={R.body.grade} value={R.body.weight !== null ? `${R.body.weight.toFixed(1)} lb` : '—'}
              sub={R.body.change !== null ? `${R.body.change > 0 ? '+' : ''}${R.body.change} lb vs last week (${R.body.phase})` : `${R.body.weighIns} weigh-in${R.body.weighIns === 1 ? '' : 's'} this week`} />
            <Tile label="Steps / sleep" value={`${r0(R.body.steps)}`} sub={`avg steps · ${R.body.sleep !== null ? R.body.sleep.toFixed(1) + ' h sleep' : 'no sleep logged'}`} />
            {R.measurements && <Tile label="Waist" grade={R.measurements.waistChange < 0 ? 'good' : R.measurements.waistChange === 0 ? 'ok' : profile.phase === 'cut' ? 'bad' : 'ok'}
              value={`${R.measurements.waistChange > 0 ? '+' : ''}${R.measurements.waistChange}"`} sub={`${md(R.measurements.from)} → ${md(R.measurements.to)}`} to={`/coach/body/${clientId}`} />}
          </div>

          {data.weekCheckin && (
            <Section title="Their check-in" right={<span className="muted" style={{ fontSize: 12 }}>{new Date(data.weekCheckin.submitted_at).toLocaleDateString()}</span>}>
              <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13.5 }}>
                {data.weekCheckin.energy != null && <span>Energy <strong>{data.weekCheckin.energy}/10</strong></span>}
                {data.weekCheckin.hunger != null && <span>Hunger <strong>{data.weekCheckin.hunger}/10</strong></span>}
                {data.weekCheckin.stress != null && <span>Stress <strong>{data.weekCheckin.stress}</strong></span>}
                {data.weekCheckin.notes && <span style={{ flexBasis: '100%', fontStyle: 'italic' }}>“{data.weekCheckin.notes}”</span>}
                <Link to="/coach/checkins" style={{ fontSize: 12.5 }}>Reply on Check-ins →</Link>
              </div>
            </Section>
          )}

          <Section title="Daily tracking">
            <div className="card" style={{ padding: '6px 10px', overflowX: 'auto' }}>
              <WeekTable summary={summarizeWeek(days, Object.fromEntries(d.daily.map(r => [r.log_date, r])), d.workoutDates)} />
            </div>
          </Section>

          <Section title="Food log · daily totals">
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <WeekTotals table={weekTable(d.mealLogs, days, t, today)} targets={t} today={today} />
            </div>
          </Section>

          {d.habits.length > 0 && (
            <Section title="Habits">
              <div className="card" style={{ padding: '6px 0' }}>
                <HabitGrid habits={d.habits} days={days} stats={monthStats(d.habits, d.habitLogs, days, today)} today={today} />
              </div>
            </Section>
          )}

          <Section title="Photos" right={<Link to={`/coach/body/${clientId}`} style={{ fontSize: 12 }}>All photos →</Link>}>
            {data.photos.length === 0 ? <div className="card muted" style={{ fontSize: 13 }}>No photos in the last five weeks.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.photos.length}, minmax(0, 1fr))`, gap: 10, maxWidth: 780 }}>
                {data.photos.map(r => (
                  <div key={r.id} className="card" style={{ padding: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{md(r.date)}{r.weight ? ` · ${r.weight} lb` : ''}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      {['Front', 'Side', 'Back'].map(k => (
                        <div key={k} style={{ aspectRatio: '3 / 4', background: '#141414', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}>
                          {urls[r[k]] ? <img src={urls[r[k]]} alt={k} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="muted" style={{ fontSize: 10, display: 'block', textAlign: 'center', marginTop: '45%' }}>{k}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      })()}
    </div>
  )
}
