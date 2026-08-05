import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import ClientHome from './ClientHome'
import ClientTraining from './ClientTraining'
import ClientNutrition from './ClientNutrition'
import ClientMessages from './ClientMessages'
import ClientCheckin from './ClientCheckin'
import ClientProgress from './ClientProgress'
import ClientFormChecks from './ClientFormChecks'
import ClientLeaderboard from './ClientLeaderboard'
import ClientResources from './ClientResources'
import ClientRoadmap from './ClientRoadmap'

export default function ClientApp() {
  return (
    <div className="client-shell">
      <main className="client-main">
        <Routes>
          <Route index element={<ClientHome />} />
          <Route path="training" element={<ClientTraining />} />
          <Route path="nutrition" element={<ClientNutrition />} />
          <Route path="messages" element={<ClientMessages />} />
          <Route path="checkin" element={<ClientCheckin />} />
          <Route path="progress" element={<ClientProgress />} />
          <Route path="form-checks" element={<ClientFormChecks />} />
          <Route path="challenges" element={<ClientLeaderboard />} />
          <Route path="resources" element={<ClientResources />} />
          <Route path="roadmap" element={<ClientRoadmap />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        <NavLink to="/app" end><span className="ico">▪</span>Home</NavLink>
        <NavLink to="/app/training"><span className="ico">▪</span>Train</NavLink>
        <NavLink to="/app/nutrition"><span className="ico">▪</span>Eat</NavLink>
        <NavLink to="/app/checkin"><span className="ico">▪</span>Check-in</NavLink>
        <NavLink to="/app/progress"><span className="ico">▪</span>Log</NavLink>
        <NavLink to="/app/form-checks"><span className="ico">▪</span>Film</NavLink>
        <NavLink to="/app/challenges"><span className="ico">▪</span>Rank</NavLink>
        <NavLink to="/app/messages"><span className="ico">▪</span>Coach</NavLink>
      </nav>
    </div>
  )
}
