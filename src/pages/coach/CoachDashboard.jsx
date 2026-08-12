import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Bell, Video, Trophy, FileText, BookOpen, Map, Users2,
  ClipboardList, Library, ListChecks, CalendarCheck, MessageCircle, Quote,
} from 'lucide-react'
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
import CoachHub from './CoachHub'
import CoachCheckins from './CoachCheckins'
import CoachMessages from './CoachMessages'

export default function CoachDashboard() {
  const { signOut } = useAuth()
  return (
    <div className="coach-shell">
      <aside className="coach-side">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 14px 20px' }}>
          <img src="/icon-192.png" alt="" style={{ width: 38, height: 38, borderRadius: 7, objectFit: 'cover' }} />
          <div className="wordmark" style={{ fontSize: 19 }}>Workhorse <span>Strong</span></div>
        </div>
        <NavLink to="/coach" end><LayoutDashboard size={17} strokeWidth={2} /><span>Home</span></NavLink>
        <NavLink to="/coach/clients"><Users size={17} strokeWidth={2} /><span>Clients</span></NavLink>
        <NavLink to="/coach/alerts"><Bell size={17} strokeWidth={2} /><span>Alerts</span></NavLink>
        <NavLink to="/coach/form-checks"><Video size={17} strokeWidth={2} /><span>Form Checks</span></NavLink>
        <NavLink to="/coach/challenges"><Trophy size={17} strokeWidth={2} /><span>Challenges</span></NavLink>
        <NavLink to="/coach/resources"><FileText size={17} strokeWidth={2} /><span>Resources</span></NavLink>
        <NavLink to="/coach/hub"><BookOpen size={17} strokeWidth={2} /><span>Client Hub</span></NavLink>
        <NavLink to="/coach/roadmap"><Map size={17} strokeWidth={2} /><span>Roadmap</span></NavLink>
        <NavLink to="/coach/community"><Users2 size={17} strokeWidth={2} /><span>Community</span></NavLink>
        <NavLink to="/coach/programs"><ClipboardList size={17} strokeWidth={2} /><span>Programs</span></NavLink>
        <NavLink to="/coach/library"><Library size={17} strokeWidth={2} /><span>Library</span></NavLink>
        <NavLink to="/coach/forms"><ListChecks size={17} strokeWidth={2} /><span>Forms</span></NavLink>
        <NavLink to="/coach/checkins"><CalendarCheck size={17} strokeWidth={2} /><span>Check-ins</span></NavLink>
        <NavLink to="/coach/messages"><MessageCircle size={17} strokeWidth={2} /><span>Messages</span></NavLink>
        <NavLink to="/coach/testimonials"><Quote size={17} strokeWidth={2} /><span>Testimonials</span></NavLink>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </aside>
      <main className="coach-main">
        <Routes>
          <Route index element={<CoachHome />} />
          <Route path="clients" element={<CoachClients />} />
          <Route path="programs" element={<CoachPrograms />} />
          <Route path="library" element={<CoachLibrary />} />
          <Route path="forms" element={<CoachForms />} />
          <Route path="alerts" element={<CoachAlerts />} />
          <Route path="form-checks" element={<CoachFormChecks />} />
          <Route path="challenges" element={<CoachChallenges />} />
          <Route path="resources" element={<CoachResources />} />
          <Route path="hub" element={<CoachHub />} />
          <Route path="roadmap" element={<CoachRoadmap />} />
          <Route path="community" element={<ClientCommunity isCoach />} />
          <Route path="print/:clientId" element={<CoachPrintSummary />} />
          <Route path="logs/:clientId" element={<CoachClientLogs />} />
          <Route path="testimonials" element={<CoachTestimonials />} />
          <Route path="checkins" element={<CoachCheckins />} />
          <Route path="messages" element={<CoachMessages />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      </main>
    </div>
  )
}
