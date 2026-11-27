import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr } from '../../lib/weeks'
import ClientDashboard from './ClientDashboard'
import { RemindersPrompt } from '../ReminderSettings'
import QuickCheckin from './QuickCheckin'
import DailyRx from './DailyRx'
import AnnouncementBanner from './AnnouncementBanner'
import NextCallCard from './NextCallCard'
import { OnboardingCard } from './Onboarding'
import GroupCallCard from './GroupCallCard'
import SetupChecklist from './SetupChecklist'
import WinsCard from './WinsCard'
import ShowFuelCard from './ShowFuelCard'
import { countedLogs } from '../../lib/foodlog'

export default function ClientHome() {
  const [setupShown, setSetupShown] = useState(false)
  const { profile } = useAuth()
  const [todayMacros, setTodayMacros] = useState({ p: 0, c: 0, f: 0 })
  const [readiness, setReadiness] = useState(null)
  const [readinessSaved, setReadinessSaved] = useState(false)
  const [milestonePrompt, setMilestonePrompt] = useState(null)
  const [testimonialText, setTestimonialText] = useState('')
  const [testimonialSent, setTestimonialSent] = useState(false)
  const [pendingForms, setPendingForms] = useState(0)
  const [pendingContracts, setPendingContracts] = useState(0)
  const [hasFoodToday, setHasFoodToday] = useState(true)
  const [hasStepsToday, setHasStepsToday] = useState(true)

  useEffect(() => {
    if (!profile) return
    const today = localDateStr()
    supabase.from('meal_logs').select('protein_g,carbs_g,fat_g,meal,logged_on')
      .eq('client_id', profile.id).eq('logged_on', today)
      .then(({ data }) => {
        const t = countedLogs(data || []).reduce((a, m) => ({
          p: a.p + m.protein_g, c: a.c + m.carbs_g, f: a.f + m.fat_g
        }), { p: 0, c: 0, f: 0 })
        setTodayMacros(t)
        setHasFoodToday((data || []).length > 0)
      })
    supabase.from('daily_logs').select('steps').eq('client_id', profile.id).eq('log_date', today).maybeSingle()
      .then(({ data }) => setHasStepsToday(data?.steps != null))
    supabase.from('daily_logs').select('readiness').eq('client_id', profile.id).eq('log_date', localDateStr()).maybeSingle()
      .then(({ data }) => setReadiness(data?.readiness ?? null))
    supabase.from('standalone_form_assignments').select('id', { count: 'exact', head: true })
      .eq('client_id', profile.id).eq('status', 'pending')
      .then(({ count }) => setPendingForms(count || 0))
    supabase.from('contracts').select('id', { count: 'exact', head: true })
      .eq('client_id', profile.id).eq('status', 'sent')
      .then(({ count }) => setPendingContracts(count || 0))
    checkMilestones()
  }, [profile])

  async function checkMilestones() {
    const [{ data: daily }, { data: checkins }, { data: shown }] = await Promise.all([
      supabase.from('daily_logs').select('weight, log_date').eq('client_id', profile.id).order('log_date'),
      supabase.from('checkins').select('id').eq('client_id', profile.id),
      supabase.from('milestone_prompts_shown').select('milestone_key').eq('client_id', profile.id),
    ])
    const shownKeys = new Set((shown || []).map(s => s.milestone_key))
    const weighed = (daily || []).filter(d => d.weight)
    let candidate = null
    if (weighed.length >= 2) {
      const change = Math.abs(weighed[weighed.length - 1].weight - weighed[0].weight)
      if (change >= 10 && !shownKeys.has('weight-10')) candidate = { key: 'weight-10', label: `${Math.round(change)} lbs of progress` }
    }
    const checkinCount = (checkins || []).length
    if (!candidate) {
      for (const n of [12, 8, 4]) {
        if (checkinCount >= n && !shownKeys.has(`checkins-${n}`)) { candidate = { key: `checkins-${n}`, label: `${n} check-ins strong` }; break }
      }
    }
    if (candidate) setMilestonePrompt(candidate)
  }

  async function dismissMilestone() {
    if (milestonePrompt) await supabase.from('milestone_prompts_shown').insert({ client_id: profile.id, milestone_key: milestonePrompt.key })
    setMilestonePrompt(null)
  }

  async function sendTestimonial() {
    if (!testimonialText.trim() || !milestonePrompt) return
    await supabase.from('testimonials').insert({ client_id: profile.id, body: testimonialText.trim(), milestone_label: milestonePrompt.label })
    await supabase.from('milestone_prompts_shown').insert({ client_id: profile.id, milestone_key: milestonePrompt.key })
    setTestimonialSent(true)
    setTimeout(() => { setMilestonePrompt(null); setTestimonialSent(false); setTestimonialText('') }, 1800)
  }

  async function saveReadiness(val) {
    setReadiness(val)
    await supabase.from('daily_logs').upsert({ client_id: profile.id, log_date: localDateStr(), readiness: val }, { onConflict: 'client_id,log_date' })
    setReadinessSaved(true); setTimeout(() => setReadinessSaved(false), 1500)
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DailyRx profile={profile} />

      <AnnouncementBanner profile={profile} />
      <OnboardingCard profile={profile} />
      {profile?.plan !== 'group' && <NextCallCard profile={profile} />}
      <GroupCallCard profile={profile} />
      <ShowFuelCard profile={profile} />
      <SetupChecklist profile={profile} onVisible={setSetupShown} />
      <WinsCard profile={profile} />

      {milestonePrompt && (
        <div className="card glow-behind" style={{ textAlign: 'center' }}>
          {!testimonialSent ? (
            <>
              <div style={{ fontSize: 26, marginBottom: 4 }}>🎉</div>
              <strong style={{ fontSize: 15 }}>{milestonePrompt.label}!</strong>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Mind sharing a quick shoutout? It genuinely helps.</p>
              <textarea rows="2" placeholder="What's been working for you?" value={testimonialText} onChange={e => setTestimonialText(e.target.value)} style={{ marginTop: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={sendTestimonial} disabled={!testimonialText.trim()}>Share</button>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={dismissMilestone}>Not now</button>
              </div>
            </>
          ) : <strong style={{ fontSize: 14, color: 'var(--green)' }}>Thank you! 🙌</strong>}
        </div>
      )}

      {(!hasFoodToday || !hasStepsToday) && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--orange-hot)' }}>
            {!hasFoodToday && !hasStepsToday ? "Log today's food & steps" : !hasFoodToday ? "Log today's food" : "Log today's steps"}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Keeps your coach in the loop and your streak alive</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {!hasFoodToday && <Link to="/app/nutrition" className="btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '7px 14px', fontSize: 12 }}>Log food</Link>}
            {!hasStepsToday && <Link to="/app/progress" className="btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '7px 14px', fontSize: 12 }}>Log steps</Link>}
          </div>
        </div>
      )}

      {(pendingContracts > 0 || pendingForms > 0) && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--orange-hot)' }}>
            Your coach sent you {[pendingContracts > 0 && `${pendingContracts === 1 ? 'an agreement' : pendingContracts + ' agreements'} to sign`, pendingForms > 0 && `${pendingForms === 1 ? 'a form' : pendingForms + ' forms'} to fill in`].filter(Boolean).join(' and ')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pendingContracts > 0 && <Link to="/app/contracts" className="btn" style={{ textDecoration: 'none', padding: '7px 14px', fontSize: 13 }}>Review &amp; sign</Link>}
            {pendingForms > 0 && <Link to="/app/intake-forms" className={pendingContracts > 0 ? 'btn-ghost' : 'btn'} style={{ textDecoration: 'none', padding: '7px 14px', fontSize: 13 }}>Open {pendingForms === 1 ? 'form' : 'forms'}</Link>}
          </div>
        </div>
      )}

      {/* the check-in reminder is now pinned to the top of every screen (CheckinNag, Update 158) */}

      <QuickCheckin profile={profile} />

      {!setupShown && <RemindersPrompt />}

      {profile && <ClientDashboard profile={profile} />}

      {/* clients on an adherence tier rate recovery in the quick check-in instead */}
      {!profile?.adherence_tier && (
      <div className="card">
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>How are you feeling today?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1,2,3,4,5].map(v => (
            <button key={v} onClick={() => saveReadiness(v)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 15, fontWeight: 800,
                background: readiness === v ? 'var(--orange)' : 'var(--steel)',
                color: readiness === v ? '#fff' : 'var(--muted)',
              }}>{v}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 10.5, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>Rough</span><span>{readinessSaved ? 'Saved ✓' : 'Great'}</span>
        </div>
      </div>
      )}

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 12 }}>Today's macros</div>
        {[
          ['Protein', todayMacros.p, profile?.protein_g],
          ['Carbs', todayMacros.c, profile?.carbs_g],
          ['Fat', todayMacros.f, profile?.fat_g],
        ].map(([label, val, target]) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 5 }}>
              <span>{label}</span>
              <span className="muted">{val} / {target || 0} g</span>
            </div>
            <div className="bar-track">
              <div className={`bar-fill${target && val > target ? ' over' : ''}`}
                style={{ width: `${target ? Math.min(100, (val / target) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
