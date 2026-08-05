import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
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
        <NavLink to="/coach" end>Home</NavLink>
        <NavLink to="/coach/clients">Clients</NavLink>
        <NavLink to="/coach/alerts">Alerts</NavLink>
        <NavLink to="/coach/form-checks">Form Checks</NavLink>
        <NavLink to="/coach/challenges">Challenges</NavLink>
        <NavLink to="/coach/resources">Resources</NavLink>
        <NavLink to="/coach/roadmap">Roadmap</NavLink>
        <NavLink to="/coach/community">Community</NavLink>
        <NavLink to="/coach/programs">Programs</NavLink>
        <NavLink to="/coach/library">Library</NavLink>
        <NavLink to="/coach/forms">Forms</NavLink>
        <NavLink to="/coach/checkins">Check-ins</NavLink>
        <NavLink to="/coach/messages">Messages</NavLink>
        <NavLink to="/coach/testimonials">Testimonials</NavLink>
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
          <Route path="roadmap" element={<CoachRoadmap />} />
          <Route path="community" element={<ClientCommunity isCoach />} />
          <Route path="print/:clientId" element={<CoachPrintSummary />} />
          <Route path="testimonials" element={<CoachTestimonials />} />
          <Route path="checkins" element={<CoachCheckins />} />
          <Route path="messages" element={<CoachMessages />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      </main>
    </div>
  )
}
