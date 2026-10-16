import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import Join from './pages/Join'
import ClientArchived from './pages/client/ClientArchived'
import ClientApp from './pages/client/ClientApp'
import CoachDashboard from './pages/coach/CoachDashboard'

export default function App() {
  const { session, profile, loading, needsPassword } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <div className="wordmark">Workhorse <span>Strong</span></div>
      </div>
    )
  }

  if (!session) {
    const m = window.location.pathname.match(/^\/join\/([^/]+)/)
    return m ? <Join code={decodeURIComponent(m[1])} /> : <Login />
  }
  if (needsPassword) return <SetPassword />

  if (profile?.role === 'coach') {
    return (
      <Routes>
        <Route path="/coach/*" element={<CoachDashboard />} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Routes>
    )
  }

  if (profile?.status === 'exited') return <ClientArchived />

  return (
    <Routes>
      <Route path="/app/*" element={<ClientApp />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
