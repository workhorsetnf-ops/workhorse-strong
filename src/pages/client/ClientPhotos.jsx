import { useAuth } from '../../context/AuthContext'
import ProgressPhotos from './ProgressPhotos'

export default function ClientPhotos() {
  const { profile } = useAuth()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <div className="eyebrow">Every 2 weeks</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Progress Photos</h1>
      </header>
      {profile && <ProgressPhotos clientId={profile.id} />}
    </div>
  )
}
