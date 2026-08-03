import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ClientApp from './pages/client/ClientApp'
import CoachDashboard from './pages/coach/CoachDashboard'

export default function App() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <div className="wordmark">Workhorse <span>Strong</span></div>
      </div>
    )
  }

  if (!session) return <Login />

  if (profile?.role === 'coach') {
    return (
      <Routes>
        <Route path="/coach/*" element={<CoachDashboard />} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/app/*" element={<ClientApp />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
