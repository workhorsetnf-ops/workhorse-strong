import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { loadCoachBadges, markSectionSeen } from '../../lib/coachBadges'
import CoachTemplates from './CoachTemplates'
import CoachReview from './CoachReview'
import CoachBody from './CoachBody'
import ReminderSettings from '../ReminderSettings'
import {
  LayoutDashboard, Users, Bell, Video, Trophy, FileText, BookOpen, Map, Users2,
  ClipboardList, Library, ListChecks, CalendarCheck, MessageCircle, Quote, Target, Webcam,
  FileCheck2, ClipboardSignature, Copy, BellRing, Gauge } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import CoachHome from './CoachHome'
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

export default function CoachDashboard() {
  const { signOut, profile } = useAuth()
  const location = useLocation()
  const [badges, setBadges] = useState({})
  const me = profile?.id

  // Re-count what's waiting on every page change, every minute, when the app
  // comes back to the foreground, and right after something is marked read.
  useEffect(() => {
    if (!me) return
    let alive = true
    const refresh = async () => {
      if (location.pathname.startsWith('/coach/community')) await markSectionSeen(me, 'community')
      const b = await loadCoachBadges(me)
      if (alive) setBadges(b)
    }
    const t = setTimeout(refresh, 600)
    const i = setInterval(refresh, 60000)
    const vis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('ws-coach-badges', refresh)
    window.addEventListener('ws-badges', refresh)
    document.addEventListener('visibilitychange', vis)
    return () => { alive = false; clearTimeout(t); clearInterval(i); window.removeEventListener('ws-coach-badges', refresh); window.removeEventListener('ws-badges', refresh); document.removeEventListener('visibilitychange', vis) }
  }, [me, location.pathname])

  // A lit tab: orange glow plus the count.
  const Item = ({ to, end, icon: Icon, label, n }) => (
    <NavLink to={to} end={end} className={({ isActive }) => [isActive ? 'active' : '', n > 0 ? 'has-new' : ''].join(' ').trim()}
      title={n > 0 ? `${n} waiting` : undefined}>
      <Icon size={17} strokeWidth={2} /><span>{label}</span>
      {n > 0 && <b className="nav-count">{n > 99 ? '99+' : n}</b>}
    </NavLink>
  )

  return (
    <div className="coach-shell">
      <aside className="coach-side">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px 20px' }}>
          <img src="/icon-192.png" alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover' }} />
          <div className="wordmark" style={{ fontSize: 19 }}>Workhorse <span>Strong</span></div>
        </div>
        <NavLink to="/coach" end><LayoutDashboard size={17} strokeWidth={2} /><span>Home</span></NavLink>
        <NavLink to="/coach/pipeline"><Target size={17} strokeWidth={2} /><span>Pipeline</span></NavLink>
        <NavLink to="/coach/clients"><Users size={17} strokeWidth={2} /><span>Clients</span></NavLink>
        <NavLink to="/coach/alerts"><Bell size={17} strokeWidth={2} /><span>Alerts</span></NavLink>
        <Item to="/coach/form-checks" icon={Video} label="Form Checks" n={badges.formChecks} />
        <NavLink to="/coach/challenges"><Trophy size={17} strokeWidth={2} /><span>Challenges</span></NavLink>
        <NavLink to="/coach/resources"><FileText size={17} strokeWidth={2} /><span>Resources</span></NavLink>
        <NavLink to="/coach/hub"><BookOpen size={17} strokeWidth={2} /><span>Client Hub</span></NavLink>
        <NavLink to="/coach/roadmap"><Map size={17} strokeWidth={2} /><span>Roadmap</span></NavLink>
        <Item to="/coach/community" icon={Users2} label="Community" n={badges.community} />
        <NavLink to="/coach/programs"><ClipboardList size={17} strokeWidth={2} /><span>Programs</span></NavLink>
        <NavLink to="/coach/library"><Library size={17} strokeWidth={2} /><span>Library</span></NavLink>
        <NavLink to="/coach/templates"><Copy size={17} strokeWidth={2} /><span>Templates & Tracks</span></NavLink>
        <NavLink to="/coach/forms"><ListChecks size={17} strokeWidth={2} /><span>Forms</span></NavLink>
        <NavLink to="/coach/intake-forms"><FileCheck2 size={17} strokeWidth={2} /><span>Intake Forms</span></NavLink>
        <NavLink to="/coach/contracts"><ClipboardSignature size={17} strokeWidth={2} /><span>Contracts</span></NavLink>
        <Item to="/coach/checkins" icon={CalendarCheck} label="Check-ins" n={badges.checkins} />
        <NavLink to="/coach/scorecard"><Gauge size={17} strokeWidth={2} /><span>Scorecard</span></NavLink>
        <NavLink to="/coach/calls"><Webcam size={17} strokeWidth={2} /><span>Calls</span></NavLink>
        <Item to="/coach/messages" icon={MessageCircle} label="Messages" n={badges.messages} />
        <NavLink to="/coach/testimonials"><Quote size={17} strokeWidth={2} /><span>Testimonials</span></NavLink>
        <NavLink to="/coach/notifications"><BellRing size={17} strokeWidth={2} /><span>Notifications</span></NavLink>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </aside>
      <main className="coach-main">
        <Routes>
          <Route index element={<CoachHome />} />
          <Route path="pipeline" element={<CoachPipeline />} />
          <Route path="clients" element={<CoachClients />} />
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
          <Route path="review/:clientId" element={<CoachReview />} />
          <Route path="body/:clientId" element={<CoachBody />} />
          <Route path="health/:clientId" element={<CoachHealth />} />
          <Route path="nutrition/:clientId" element={<CoachNutrition />} />
          <Route path="testimonials" element={<CoachTestimonials />} />
          <Route path="checkins" element={<CoachCheckins />} />
          <Route path="scorecard" element={<CoachScorecard />} />
          <Route path="calls" element={<CoachCalls />} />
          <Route path="messages" element={<CoachMessages />} />
          <Route path="notifications" element={<ReminderSettings />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      </main>
    </div>
  )
}
