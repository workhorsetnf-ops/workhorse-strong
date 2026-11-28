// Profile tab, CoachRx-style (Update 189; laid out row-for-row like CoachRx in Update 192): the client's card, their coach,
// two compliance tiles (workouts completed, current streak of scheduled
// sessions hit), then every screen that used to be a bottom-nav tab or a
// Home quick link, as one tidy list. The old edit form lives at /app/profile/edit.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings, Pencil, ChevronRight, Zap, Flame, ClipboardCheck, Video, Dumbbell, Calendar, HeartPulse, BarChart3, Camera, Ruler,
  Medal, Award, Trophy, CalendarCheck, Pill, Droplet, ClipboardSignature, FileText, MapPin, HelpCircle, Users2, List, Clock, Bookmark,
  PhoneCall, Bell, LogOut, Activity, ClipboardList, Bike, Link2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { localDateStr, logDate } from '../../lib/weeks'
import { addDays } from '../../lib/dashboard'
import { loadProgramSchedule, sessionsOnDate } from '../../lib/conditioning'
import { dateRange, sessionStreak } from '../../lib/clientRx'
import { isGroup } from './GroupMembership'
import Avatar from '../Avatar'

function Row({ to, href, icon: Icon, label, badge, dot, onClick, trailing }) {
  const inner = (
    <>
      {Icon && (
        <span style={{ width: 54, height: 54, borderRadius: 8, background: 'var(--steel)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={26} color="var(--orange-hot)" />
        </span>
      )}
      <span style={{ flex: 1, fontSize: 18 }}>{label}</span>
      {badge > 0 && <span style={{ background: 'var(--orange)', color: '#140A02', fontSize: 12, fontWeight: 800, borderRadius: 12, minWidth: 22, height: 22, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{badge}</span>}
      {dot && <span aria-label="needs attention" style={{ width: 9, height: 9, borderRadius: 5, background: 'var(--red)' }} />}
      {trailing || (href ? <Link2 size={24} color="var(--muted)" /> : <ChevronRight size={22} color="var(--muted)" />)}
    </>
  )
  const style = { display: 'flex', alignItems: 'center', gap: 16, padding: Icon ? '14px 20px 14px 18px' : '22px 20px', minHeight: 82, boxSizing: 'border-box', width: '100%',
    background: 'var(--coal)', border: 'none', borderRadius: 10, textDecoration: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left', font: 'inherit' }
  if (onClick) return <button type="button" onClick={onClick} style={style}>{inner}</button>
  return href
    ? <a href={href} target="_blank" rel="noreferrer" style={style}>{inner}</a>
    : <Link to={to} style={style}>{inner}</Link>
}

const Section = ({ title, children }) => (
  <section style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
    <h2 style={{ fontSize: 22, letterSpacing: '.01em', textTransform: 'uppercase' }}>{title}</h2>
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
      <header className="rx-profile-bar">
        <h1 style={{ fontSize: 28 }}>Profile</h1>
        <Link to="/app/profile/edit" aria-label="Settings" style={{ color: 'var(--white)', display: 'flex' }}><Settings size={28} /></Link>
      </header>

      <Link to="/app/profile/edit" style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none', color: 'inherit', padding: '8px 0 12px' }}>
        <Avatar url={profile?.avatar_url} name={profile?.full_name} size={76} ring="4px solid var(--green)" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 23 }}>{profile?.full_name || 'Athlete'}</strong>
          <span style={{ display: 'block', fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session?.user?.email || profile?.email || ''}</span>
        </span>
        <Pencil size={24} aria-label="Edit profile" />
      </Link>

      {coach && (
        <Link to={group ? '/app/community' : '/app/messages'} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', background: 'var(--coal)', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
          <span style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar url={coach.avatar_url} name={coach.full_name} size={60} />
            <span aria-hidden="true" style={{ position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, background: 'var(--steel)', border: '3px solid var(--coal)' }} />
          </span>
          <span style={{ flex: 1 }}>
            <span className="muted" style={{ display: 'block', fontSize: 16 }}>Your Coach</span>
            <strong style={{ fontSize: 22 }}>{coach.full_name || 'Coach'}</strong>
          </span>
          <ChevronRight size={22} color="var(--muted)" />
        </Link>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
        <h2 style={{ fontSize: 23 }}>Compliance</h2>
        <Link to="/app/recap" style={{ fontSize: 14, fontWeight: 700, letterSpacing: '.06em', color: 'var(--white)', textDecoration: 'none', borderBottom: '2px solid var(--orange)', paddingBottom: 3 }}>SEE ALL</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[[Zap, stats?.total, 'Workouts Completed', true], [Flame, stats?.streak, 'Current Streak', false]].map(([Icon, n, label, ring]) => (
          <div key={label} style={{ background: 'var(--coal)', borderRadius: 10, padding: '22px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {ring
                ? <span style={{ width: 36, height: 36, borderRadius: 18, border: '3px solid var(--green)', display: 'grid', placeItems: 'center' }}><Icon size={20} color="var(--green)" fill="var(--green)" /></span>
                : <Icon size={34} color="var(--green)" fill="var(--green)" />}
              <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }} data-stat={label}>{n ?? '–'}</span>
            </div>
            <div style={{ fontSize: 17, marginTop: 14 }}>{label}</div>
          </div>
        ))}
      </div>

      <Section title="Training">
        <Row to="/app/steps-sync" icon={HeartPulse} label="Health Data" />
        <Row to="/app/trends" icon={BarChart3} label="Metrics" />
        <Row to="/app/photos" icon={Camera} label="Progress Pictures" />
        {!group && <Row to="/app/intake-forms" icon={List} label="Intake Forms" badge={pending.forms} />}
        <Row to="/app/equipment" icon={Dumbbell} label="Equipment" />
        <Row to="/app/schedule" icon={Clock} label="Training schedule" />
        <Row to="/app/goals" icon={Medal} label="Goals" />
        {!group && <Row to="/app/documents" icon={Bookmark} label="Documents" />}
        {bookingUrl && !group && <Row href={bookingUrl} icon={PhoneCall} label="Book a Call" />}
      </Section>

      <Section title="Coaching">
        {!group && <Row to="/app/checkin" icon={ClipboardCheck} label="Weekly check-in" dot={badges.checkin} />}
        {!group && <Row to="/app/form-checks" icon={Video} label="Form checks" dot={badges.filmChecks} />}
        <Row to="/app/training" icon={ClipboardList} label="My program" />
        <Row to="/app/calendar" icon={Calendar} label="Calendar" />
        <Row to="/app/progress" icon={Activity} label="Log weight & steps" />
        <Row to="/app/measurements" icon={Ruler} label="Measurements" />
        <Row to="/app/records" icon={Award} label="Personal records" />
        <Row to="/app/cardio" icon={Bike} label="Cardio plan" />
        <Row to="/app/habits" icon={CalendarCheck} label="Habits" />
        <Row to="/app/supplements" icon={Pill} label="Supplements" />
        {!group && <Row to="/app/bloodwork" icon={Droplet} label="Bloodwork" />}
        <Row to="/app/challenges" icon={Trophy} label="Leaderboard" />
      </Section>

      <Section title="Resources">
        <Row to="/app/faq" icon={HelpCircle} label="Hub / FAQ" />
        <Row to="/app/resources" icon={FileText} label="Resources" />
        {!group && <Row to="/app/roadmap" icon={MapPin} label="Roadmap" />}
        <Row to="/app/community" icon={Users2} label="Community" />
      </Section>

      <Section title="Account">
        {!group && <Row to="/app/contracts" icon={ClipboardSignature} label="Contracts" badge={pending.contracts} />}
        <Row to="/app/reminders" icon={Bell} label="Reminders" />
        <Row onClick={signOut} label="Log Out" trailing={<LogOut size={26} />} />
      </Section>
    </div>
  )
}
