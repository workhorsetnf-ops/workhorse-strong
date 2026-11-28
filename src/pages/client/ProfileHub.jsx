// Profile tab, CoachRx-style (Update 189): the client's card, their coach,
// two compliance tiles (workouts completed, current streak of scheduled
// sessions hit), then every screen that used to be a bottom-nav tab or a
// Home quick link, as one tidy list. The old edit form lives at /app/profile/edit.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings, Pencil, ChevronRight, Zap, Flame, ClipboardCheck, Video, Dumbbell, Calendar, HeartPulse, LineChart, Camera, Ruler,
  Medal, Trophy, CalendarCheck, Pill, Droplet, FileCheck2, FileStack, ClipboardSignature, FileText, MapPin, HelpCircle, Users2,
  PhoneCall, Bell, LogOut, Activity, Smartphone, Link2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, logDate } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { loadProgramSchedule, sessionsOnDate } from '../../lib/conditioning'
import { dateRange, sessionStreak } from '../../lib/clientRx'
import { isGroup } from './GroupMembership'
import Avatar from '../Avatar'

function Row({ to, href, icon: Icon, label, badge, dot }) {
  const inner = (
    <>
      <span style={{ width: 46, height: 46, borderRadius: 10, background: 'var(--steel)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={22} color="var(--orange-hot)" />
      </span>
      <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>{label}</span>
      {badge > 0 && <span style={{ background: 'var(--orange)', color: '#140A02', fontSize: 12, fontWeight: 800, borderRadius: 12, minWidth: 22, height: 22, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{badge}</span>}
      {dot && <span aria-label="needs attention" style={{ width: 9, height: 9, borderRadius: 5, background: 'var(--red)' }} />}
      {href ? <Link2 size={20} color="var(--muted)" /> : <ChevronRight size={20} color="var(--muted)" />}
    </>
  )
  const style = { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 12, textDecoration: 'none', color: 'inherit' }
  return href
    ? <a href={href} target="_blank" rel="noreferrer" style={style}>{inner}</a>
    : <Link to={to} style={style}>{inner}</Link>
}

const Section = ({ title, children }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <h2 style={{ fontSize: 19, letterSpacing: '.04em', textTransform: 'uppercase', marginTop: 6 }}>{title}</h2>
    {children}
  </section>
)

export default function ProfileHub({ badges = {} }) {
  const { profile, session, signOut } = useAuth()
  const group = isGroup(profile)
  const [coach, setCoach] = useState(null)
  const [stats, setStats] = useState(null)   // { total, streak }
  const [bookingUrl, setBookingUrl] = useState('')
  const [pending, setPending] = useState({ forms: 0, contracts: 0 })

  useEffect(() => {
    if (!profile?.id) return
    let gone = false
    supabase.from('profiles').select('id, full_name, avatar_url').eq('role', 'coach').limit(1).maybeSingle()
      .then(({ data }) => { if (!gone) setCoach(data || null) })
    supabase.from('client_hub').select('booking_url').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (!gone) setBookingUrl(data?.booking_url || '') })
    Promise.all([
      supabase.from('standalone_form_assignments').select('id', { count: 'exact', head: true }).eq('client_id', profile.id).eq('status', 'pending'),
      supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('client_id', profile.id).eq('status', 'sent'),
    ]).then(([f, c]) => { if (!gone) setPending({ forms: f.count || 0, contracts: c.count || 0 }) })
    ;(async () => {
      const today = localDateStr()
      const since = addDays(today, -59)
      const [{ data: logs }, schedule, { data: moves }] = await Promise.all([
        supabase.from('workout_logs').select('logged_date, logged_at, session_track').eq('client_id', profile.id).limit(20000),
        loadProgramSchedule(supabase, profile.id).catch(() => null),
        supabase.from('session_moves').select('*').eq('client_id', profile.id),
      ])
      const logged = new Set((logs || []).filter(l => l.session_track !== 'lifestyle').map(logDate).filter(Boolean))
      const dates = dateRange(today, 60)
      const counts = {}
      if (schedule) for (const d of dates) counts[d] = sessionsOnDate(d, schedule, moves || []).filter(s => (s.track || 'exercise') !== 'lifestyle').length
      const recent = new Set([...logged].filter(d => d >= since))
      if (!gone) setStats({ total: logged.size, streak: sessionStreak(dates, today, counts, recent) })
    })()
    return () => { gone = true }
  }, [profile?.id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 30 }}>Profile</h1>
        <Link to="/app/profile/edit" aria-label="Settings" style={{ color: 'var(--white)' }}><Settings size={26} /></Link>
      </header>

      <Link to="/app/profile/edit" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', padding: '4px 0' }}>
        <Avatar url={profile?.avatar_url} name={profile?.full_name} size={72} ring="3px solid var(--green)" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 22 }}>{profile?.full_name || 'Athlete'}</strong>
          <span className="muted" style={{ fontSize: 14, wordBreak: 'break-all' }}>{session?.user?.email || profile?.email || ''}</span>
        </span>
        <Pencil size={22} />
      </Link>

      {coach && (
        <Link to={group ? '/app/community' : '/app/messages'} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit' }}>
          <Avatar url={coach.avatar_url} name={coach.full_name} size={56} />
          <span style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', fontSize: 14 }}>Your Coach</span>
            <strong style={{ fontSize: 20 }}>{coach.full_name || 'Coach'}</strong>
          </span>
          <ChevronRight size={22} color="var(--muted)" />
        </Link>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
        <h2 style={{ fontSize: 21 }}>Compliance</h2>
        <Link to="/app/recap" style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.06em', color: 'var(--orange-hot)', textDecoration: 'none' }}>SEE ALL</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[[Zap, stats?.total, 'Workouts Completed'], [Flame, stats?.streak, 'Current Streak']].map(([Icon, n, label]) => (
          <div key={label} className="card" style={{ padding: '18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={28} color="var(--green)" />
              <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }} data-stat={label}>{n ?? '–'}</span>
            </div>
            <div style={{ fontSize: 15, marginTop: 10 }}>{label}</div>
          </div>
        ))}
      </div>

      <Section title="Training">
        {!group && <Row to="/app/checkin" icon={ClipboardCheck} label="Weekly check-in" dot={badges.checkin} />}
        <Row to="/app/training" icon={Dumbbell} label="My program" />
        <Row to="/app/calendar" icon={Calendar} label="Calendar" />
        {!group && <Row to="/app/form-checks" icon={Video} label="Form checks" dot={badges.filmChecks} />}
        <Row to="/app/progress" icon={Activity} label="Log weight & steps" />
        <Row to="/app/trends" icon={LineChart} label="Metrics" />
        <Row to="/app/steps-sync" icon={Smartphone} label="Health data sync" />
        <Row to="/app/photos" icon={Camera} label="Progress pictures" />
        <Row to="/app/measurements" icon={Ruler} label="Measurements" />
        <Row to="/app/records" icon={Medal} label="Personal records" />
        <Row to="/app/cardio" icon={HeartPulse} label="Cardio plan" />
        <Row to="/app/habits" icon={CalendarCheck} label="Habits" />
        <Row to="/app/supplements" icon={Pill} label="Supplements" />
        {!group && <Row to="/app/bloodwork" icon={Droplet} label="Bloodwork" />}
        <Row to="/app/challenges" icon={Trophy} label="Leaderboard" />
      </Section>

      <Section title="Resources">
        {!group && <Row to="/app/intake-forms" icon={FileCheck2} label="Intake forms" badge={pending.forms} />}
        {!group && <Row to="/app/documents" icon={FileStack} label="Documents" />}
        {!group && <Row to="/app/contracts" icon={ClipboardSignature} label="Contracts" badge={pending.contracts} />}
        {!group && <Row to="/app/roadmap" icon={MapPin} label="Roadmap" />}
        <Row to="/app/faq" icon={HelpCircle} label="Hub / FAQ" />
        <Row to="/app/resources" icon={FileText} label="Resources" />
        <Row to="/app/community" icon={Users2} label="Community" />
        {bookingUrl && !group && <Row href={bookingUrl} icon={PhoneCall} label="Book a Call" />}
      </Section>

      <Section title="Account">
        <Row to="/app/reminders" icon={Bell} label="Reminders" />
        <Row to="/app/profile/edit" icon={Pencil} label="Edit my details" />
        <button type="button" onClick={signOut} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 14px', background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 12, color: 'inherit', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}>
          <span style={{ flex: 1, textAlign: 'left' }}>Log out</span><LogOut size={20} />
        </button>
      </Section>
    </div>
  )
}
