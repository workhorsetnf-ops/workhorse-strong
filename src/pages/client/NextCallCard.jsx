// Client Home: the client's next booked call with their coach (within a week),
// with the Join button lighting up 15 minutes before it starts.
import { useEffect, useState } from 'react'
import { Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callPhase, startsInText } from '../../lib/agenda'

export default function NextCallCard({ profile }) {
  const [call, setCall] = useState(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!profile?.id) return
    const from = new Date(Date.now() - 2 * 3600000).toISOString()
    const to = new Date(Date.now() + 7 * 86400000).toISOString()
    supabase.from('bookings').select('id, starts_at, ends_at, status, video_url, call_types(name)')
      .eq('client_id', profile.id).eq('status', 'booked').gte('starts_at', from).lte('starts_at', to).order('starts_at')
      .then(({ data }) => setCall((data || []).find(b => new Date(b.ends_at) > new Date()) || null))
  }, [profile?.id])
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i) }, [])

  if (!call) return null
  const phase = callPhase(call, now)
  if (phase === 'over') return null
  const start = new Date(call.starts_at)
  const hot = phase === 'soon' || phase === 'live'
  const sameDay = start.toDateString() === now.toDateString()
  const when = new Intl.DateTimeFormat('en-US', sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start)

  return (
    <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', borderColor: hot ? 'var(--orange)' : undefined }}>
      <Video size={22} color="var(--orange)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 14 }}>
        <b>{call.call_types?.name || 'Call with your coach'}</b>
        <br />
        <span className="muted" style={{ fontSize: 13 }}>
          {sameDay ? `Today at ${when}` : when}
          {hot && <span style={{ color: phase === 'live' ? 'var(--green)' : 'var(--orange)' }}> · {phase === 'live' ? 'Happening now' : startsInText(start, now)}</span>}
        </span>
      </div>
      {call.video_url && (
        <a className={hot ? 'btn' : 'btn-ghost'} href={call.video_url} target="_blank" rel="noreferrer" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
          {phase === 'live' ? 'Join now' : 'Join'}
        </a>
      )}
    </div>
  )
}
