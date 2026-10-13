import { useAuth } from '../../context/AuthContext'
import BodyMeasurements from './BodyMeasurements'

export default function ClientMeasurements() {
  const { profile } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <div className="eyebrow">Every 2 weeks</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Measurements</h1>
      </header>
      {profile && <BodyMeasurements clientId={profile.id} />}
    </div>
  )
}
