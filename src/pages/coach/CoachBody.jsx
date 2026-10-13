import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Ruler, Camera } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import BodyMeasurements from '../client/BodyMeasurements'
import ProgressPhotos from '../client/ProgressPhotos'

export default function CoachBody() {
  const { clientId } = useParams()
  const [tab, setTab] = useState('measure')
  const [name, setName] = useState('')
  useEffect(() => { supabase.from('profiles').select('full_name').eq('id', clientId).single().then(({ data }) => setName(data?.full_name || '')) }, [clientId])
  return (
    <div>
      <Link to="/coach/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 13 }}><ChevronLeft size={15} /> Back to Clients</Link>
      <div className="eyebrow">Body</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>{name || 'Client'}</h1>
      <div style={{ height: 3, background: 'var(--orange)', borderRadius: 2, margin: '8px 0 16px' }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={tab === 'measure' ? 'btn' : 'btn-ghost'} onClick={() => setTab('measure')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ruler size={15} /> Measurements</button>
        <button className={tab === 'photos' ? 'btn' : 'btn-ghost'} onClick={() => setTab('photos')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Camera size={15} /> Photos</button>
      </div>
      {tab === 'measure' ? <BodyMeasurements clientId={clientId} isCoach /> : <div style={{ maxWidth: 760 }}><ProgressPhotos clientId={clientId} isCoach /></div>}
    </div>
  )
}
