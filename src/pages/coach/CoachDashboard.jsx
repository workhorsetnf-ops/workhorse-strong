import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation, Link } from 'react-router-dom'
import { SECTIONS, menuFor, sectionFor, topTabs, latestThreads, ago } from '../../lib/coachNav'
import { supabase } from '../../lib/supabase'
import Avatar from '../Avatar'
import CoachBusiness from './CoachBusiness'
import { loadCoachBadges, markSectionSeen } from '../../lib/coachBadges'
import CoachTemplates from './CoachTemplates'
import CoachReview from './CoachReview'
import CoachBody from './CoachBody'
import ReminderSettings from '../ReminderSettings'
import {
  LayoutDashboard, Users, Bell, Video, Trophy, FileText, BookOpen, Map, Users2,
  ClipboardList, Library, ListChecks, CalendarCheck, MessageCircle, Quote, Target, Webcam,
  FileCheck2, ClipboardSignature, Copy, BellRing, Gauge, UsersRound, MessageSquareText,
  ChevronRight, ChevronDown, MessagesSquare, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import CoachHome from './CoachHome'
import CoachGroup from './CoachGroup'
import CoachClients from './CoachClients'
import CoachPrograms from './CoachPrograms'
import CoachLibrary from './CoachLibrary'
import CoachForms from './CoachForms'
import CoachAlerts from './CoachAlerts'
import CoachFormChecks from './CoachFormChecks'
import CoachChallenges from './CoachChallenges'
import CoachResources from './CoachResources'
import CoachRoadmap from './CoachRoadmap'
import ClientCommunity from '../ClientCommunity'
import CoachPrintSummary from './CoachPrintSummary'
import CoachTestimonials from './CoachTestimonials'
import CoachClientLogs from './CoachClientLogs'
import CoachClientDay from './CoachClientDay'
import CoachHealth from './CoachHealth'
import CoachNutrition from './CoachNutrition'
import CoachHub from './CoachHub'
import CoachCheckins from './CoachCheckins'
import CoachScorecard from './CoachScorecard'
import CoachMessages from './CoachMessages'
import CoachPipeline from './CoachPipeline'
import CoachCalls from './CoachCalls'
import CoachIntakeForms from './CoachIntakeForms'
import CoachContracts from './CoachContracts'
import ContractPrint from '../ContractPrint'
import CoachProblems from './CoachProblems'
import { Bug, UserCog } from 'lucide-react'

const ICONS = { LayoutDashboard, Users, Bell, Video, Trophy, FileText, BookOpen, Map, Users2, ClipboardList, Library, ListChecks, CalendarCheck, MessageCircle, Quote, Target, Webcam, FileCheck2, ClipboardSignature, Copy, Gauge, UsersRound, MessageSquareText, UserCog }
import CoachTeam from './CoachTeam'
import TextBlast from './TextBlast'

const ViewOnly = () => <span className="muted" style={{ marginLeft: 'auto', fontSize: 11, letterSpacing: '.04em' }}>view</span>

export default function CoachDashboard() {
  const { signOut, profile, inboxId, isHeadCoach, programsLocked } = useAuth()
  const location = useLocation()
  const [badges, setBadges] = useState({})
  const me = inboxId          // assistants see the coach's inbox counts
  const self = profile?.id

  // Re-count what's waiting on every page change, every minute, when the app
  // comes back to the foreground, and right after something is marked read.
  useEffect(() => {
    if (!me) return
    let alive = true
    const refresh = async () => {
      if (location.pathname.startsWith('/coach/community')) await markSectionSeen(self, 'community')
      const b = await loadCoachBadges(me, self)
      if (alive) setBadges(b)
    }
    const t = setTimeout(refresh, 600)
    const i = setInterval(refresh, 60000)
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('ws-coach-badges', refresh)
    window.addEventListener('ws-badges', refresh)
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; clearTimeout(t); clearInterval(i); window.removeEventListener('ws-coach-badges', refresh); window.removeEventListener('ws-badges', refresh); document.removeEventListener('visibilitychange', vis) }
  }, [me, self, location.pathname])

  const path = location.pathname
  const menu = menuFor(path, isHeadCoach)
  const section = sectionFor(path)

  return (
    <div className="coach-shell coach-top">
      <header className="coach-bar">
        <NavLink to="/coach" className="coach-brand" aria-label="Workhorse Strong home">
          <img src="/icon-192.png" alt="" />
          <span className="wordmark">Workhorse <span>Strong</span></span>
        </NavLink>
        <nav className="coach-tabs" aria-label="Sections">
          {topTabs(isHeadCoach, badges).map(t => (
            <NavLink key={t.key} to={t.to} end={t.key === 'dashboard'} className={() => [section === t.key ? 'active' : '', t.waiting > 0 ? 'has-new' : ''].join(' ').trim()}>
              {t.label}{t.waiting > 0 && <b className="tab-dot" aria-label={`${t.waiting} waiting`} />}
            </NavLink>
          ))}
        </nav>
        <div className="coach-tools">
          <BellMenu badges={badges} />
          <ChatMenu me={me} self={self} n={badges.messages} />
          <AvatarMenu profile={profile} signOut={signOut} />
        </div>
      </header>
      <div className={menu.length ? 'coach-body with-menu' : 'coach-body'}>
        {menu.length > 0 && (
          <aside className="coach-menu" aria-label="Section menu">
            <div className="coach-menu-title">{SECTIONS.find(x => x.key === section)?.label === 'Programs' ? 'Index' : SECTIONS.find(x => x.key === section)?.label}</div>
            {menu.map(i => {
              const Icon = ICONS[i.icon] || ClipboardList
              const n = i.badge ? badges[i.badge] || 0 : 0
              return (
                <NavLink key={i.to} to={i.to} end={i.end || i.to === '/coach/clients'} className={({ isActive }) => [isActive ? 'active' : '', n > 0 ? 'has-new' : ''].join(' ').trim()}>
                  <Icon size={17} strokeWidth={2} /><span>{i.label}</span>
                  {i.to === '/coach/programs' && programsLocked && <ViewOnly />}
                  {i.to === '/coach/library' && programsLocked && <ViewOnly />}
                  {n > 0 && <b className="nav-count">{n > 99 ? '99+' : n}</b>}
                </NavLink>
              )
            })}
          </aside>
        )}
      <main className="coach-main">
        <Routes>
          <Route index element={<CoachHome />} />
          <Route path="pipeline" element={<CoachPipeline />} />
          <Route path="clients" element={<CoachClients />} />
          <Route path="group" element={<CoachGroup />} />
          <Route path="programs" element={<CoachPrograms />} />
          <Route path="templates" element={<CoachTemplates />} />
          <Route path="library" element={<CoachLibrary />} />
          <Route path="forms" element={<CoachForms />} />
          <Route path="intake-forms" element={<CoachIntakeForms />} />
          <Route path="contracts" element={<CoachContracts />} />
          <Route path="contracts/print/:contractId" element={<ContractPrint />} />
          <Route path="alerts" element={<CoachAlerts />} />
          <Route path="form-checks" element={<CoachFormChecks />} />
          <Route path="challenges" element={<CoachChallenges />} />
          <Route path="resources" element={<CoachResources />} />
          <Route path="hub" element={<CoachHub />} />
          <Route path="roadmap" element={<CoachRoadmap />} />
          <Route path="community" element={<ClientCommunity isCoach />} />
          <Route path="print/:clientId" element={<CoachPrintSummary />} />
          <Route path="logs/:clientId" element={<CoachClientLogs />} />
          <Route path="day/:clientId" element={<CoachClientDay />} />
          <Route path="review/:clientId" element={<CoachReview />} />
          <Route path="body/:clientId" element={<CoachBody />} />
          <Route path="health/:clientId" element={<CoachHealth />} />
          <Route path="nutrition/:clientId" element={<CoachNutrition />} />
          <Route path="testimonials" element={<CoachTestimonials />} />
          <Route path="checkins" element={<CoachCheckins />} />
          <Route path="scorecard" element={<CoachScorecard />} />
          <Route path="calls" element={<CoachCalls />} />
          <Route path="messages" element={<CoachMessages />} />
          <Route path="texts" element={<TextBlast />} />
          {isHeadCoach && <Route path="team" element={<CoachTeam />} />}
          <Route path="notifications" element={<ReminderSettings />} />
          <Route path="problems" element={<CoachProblems />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
          <Route path="business" element={<CoachBusiness />} />
        </Routes>
      </main>
      </div>
    </div>
  )
}

// 🔔 what's waiting, by type, with a way in
function BellMenu({ badges }) {
  const [open, setOpen] = useState(false)
  const rows = [['checkins', 'Check-ins to review', '/coach/checkins'], ['formChecks', 'Form checks to watch', '/coach/form-checks'], ['messages', 'Unread messages', '/coach/messages'], ['community', 'New community posts', '/coach/community']]
  const total = rows.reduce((n, [k]) => n + (badges[k] || 0), 0)
  return (
    <Dropdown open={open} setOpen={setOpen} label="Notifications" icon={<Bell size={20} />} count={total}>
      <div className="dd-head"><Link to="/coach/alerts" onClick={() => setOpen(false)}>See all</Link></div>
      {total === 0 && <p className="muted dd-empty">You're all caught up.</p>}
      {rows.filter(([k]) => badges[k] > 0).map(([k, label, to]) => (
        <Link key={k} to={to} className="dd-row" onClick={() => setOpen(false)}>
          <span className="dd-pill">{badges[k]}</span><span style={{ flex: 1 }}>{label}</span><ChevronRight size={16} />
        </Link>
      ))}
    </Dropdown>
  )
}

// 💬 latest message per client, like CoachRx's chat drop-down
function ChatMenu({ me, self, n }) {
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState(null)
  const [names, setNames] = useState({})
  async function load() {
    const { data } = await supabase.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at')
      .or(`sender_id.eq.${me},recipient_id.eq.${me}`).order('created_at', { ascending: false }).limit(300)
    const t = latestThreads(data || [], me)
    setThreads(t)
    const ids = t.map(x => x.other)
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids)
      setNames(Object.fromEntries((ps || []).map(p => [p.id, p])))
    }
  }
  useEffect(() => { if (open && me) load() }, [open, me])
  async function markAll() {
    await Promise.all((threads || []).filter(t => t.unread).map(t => supabase.rpc('mark_messages_read', { other_id: t.other })))
    window.dispatchEvent(new Event('ws-coach-badges'))
    load()
  }
  return (
    <Dropdown open={open} setOpen={setOpen} label="Messages" icon={<MessagesSquare size={20} />} count={n}>
      <div className="dd-head">
        {me === self && <button type="button" onClick={markAll}>Mark all as read</button>}
        <span className="muted">|</span>
        <Link to="/coach/messages" onClick={() => setOpen(false)}>See all</Link>
      </div>
      {threads === null && <p className="muted dd-empty">Loading…</p>}
      {threads?.length === 0 && <p className="muted dd-empty">No messages yet.</p>}
      {(threads || []).map(t => (
        <Link key={t.other} to="/coach/messages" className="dd-thread" onClick={() => setOpen(false)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar url={names[t.other]?.avatar_url} name={names[t.other]?.full_name} size={30} />
            <strong style={{ flex: 1, fontSize: 14 }}>{names[t.other]?.full_name || 'Client'}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{ago(t.last.created_at)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span className="muted" style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.last.sender_id === me ? 'You: ' : ''}{t.last.body || '📎 Attachment'}
            </span>
            <span aria-label={t.unread ? 'unread' : 'read'} style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, border: '1.5px solid ' + (t.unread ? 'var(--orange)' : 'var(--line)'), background: t.unread ? 'var(--orange)' : 'transparent' }} />
          </div>
        </Link>
      ))}
    </Dropdown>
  )
}

function AvatarMenu({ profile, signOut }) {
  const [open, setOpen] = useState(false)
  return (
    <Dropdown open={open} setOpen={setOpen} label="Account" icon={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Avatar url={profile?.avatar_url} name={profile?.full_name} size={30} /><ChevronDown size={16} /></span>} framed>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}><strong>{profile?.full_name || 'Coach'}</strong></div>
      <Link to="/coach/notifications" className="dd-row" onClick={() => setOpen(false)}><BellRing size={16} /> Notification settings</Link>
      <Link to="/coach/problems" className="dd-row" onClick={() => setOpen(false)}><Bug size={16} /> Problems log</Link>
      <button type="button" className="dd-row" onClick={signOut}><LogOut size={16} /> Sign out</button>
    </Dropdown>
  )
}

function Dropdown({ open, setOpen, label, icon, count = 0, framed, children }) {
  useEffect(() => {
    if (!open) return
    const close = e => { if (!e.target.closest?.('.dd-wrap')) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="dd-wrap">
      <button type="button" className={framed ? 'dd-btn framed' : 'dd-btn'} aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {icon}{count > 0 && <b className="dd-count">{count > 99 ? '99+' : count}</b>}
      </button>
      {open && <div className="dd-panel" role="menu" aria-label={label}>{children}</div>}
    </div>
  )
}
