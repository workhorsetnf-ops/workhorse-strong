import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import CoachClients from './CoachClients'
import CoachPrograms from './CoachPrograms'
import CoachLibrary from './CoachLibrary'
import CoachForms from './CoachForms'
import CoachCheckins from './CoachCheckins'
import CoachMessages from './CoachMessages'

export default function CoachDashboard() {
  const { signOut } = useAuth()
  return (
    <div className="coach-shell">
      <aside className="coach-side">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 18px' }}>
          <img src="/icon-192.png" alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
          <div className="wordmark" style={{ fontSize: 15 }}>Workhorse <span>Strong</span></div>
        </div>
        <NavLink to="/coach" end>Clients</NavLink>
        <NavLink to="/coach/programs">Programs</NavLink>
        <NavLink to="/coach/library">Library</NavLink>
        <NavLink to="/coach/forms">Forms</NavLink>
        <NavLink to="/coach/checkins">Check-ins</NavLink>
        <NavLink to="/coach/messages">Messages</NavLink>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={signOut}>Sign out</button>
      </aside>
      <main className="coach-main">
        <Routes>
          <Route index element={<CoachClients />} />
          <Route path="programs" element={<CoachPrograms />} />
          <Route path="library" element={<CoachLibrary />} />
          <Route path="forms" element={<CoachForms />} />
          <Route path="checkins" element={<CoachCheckins />} />
          <Route path="messages" element={<CoachMessages />} />
          <Route path="*" element={<Navigate to="/coach" replace />} />
        </Routes>
      </main>
    </div>
  )
}
