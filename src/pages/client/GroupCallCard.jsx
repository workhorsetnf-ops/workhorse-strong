// Workhorse 90 members: the next monthly group call (Update 180), with the
// Join button lighting up 15 minutes before it starts.
import { useEffect, useState } from 'react'
import { Users2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { callPhase, startsInText, nextGroupCall } from '../../lib/agenda'

export default function GroupCallCard({ profile }) {
  const [call, setCall] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const isW90 = profile?.plan === 'group' && profile?.group_tier === 'w90'

  useEffect(() => {
    if (!isW90) return
    const from = new Date(Date.now() - 4 * 3600000).toISOString()
    supabase.from('group_calls').select('id, title, starts_at, duration_minutes, link_url, notes')
      .gte('starts_at', from).order('starts_at').limit(5)
      .then(({ data }) => setCall(nextGroupCall(data)))
  }, [isW90, profile?.id])
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(i) }, [])

  if (!isW90) return null
  if (!call) {
    return (
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Users2 size={22} color="var(--orange)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 14 }}><b>Monthly group call</b><br /><span className="muted" style={{ fontSize: 13 }}>The next date goes up here as soon as it’s set.</span></div>
      </div>
    )
  }
  const phase = callPhase(call, now)
  const start = new Date(call.starts_at)
  const hot = phase === 'soon' || phase === 'live'
  const when = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(start)

  return (
    <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: hot ? 'var(--orange)' : undefined }}>
      <Users2 size={22} color="var(--orange)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 14, minWidth: 180 }}>
        <b>{call.title}</b>
        <br />
        <span className="muted" style={{ fontSize: 13 }}>
          {when}
          {hot && <span style={{ color: phase === 'live' ? 'var(--green)' : 'var(--orange)' }}> · {phase === 'live' ? 'Happening now' : startsInText(start, now)}</span>}
        </span>
        {call.notes && <div className="muted" style={{ fontSize: 12.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{call.notes}</div>}
      </div>
      <a className={hot ? 'btn' : 'btn-ghost'} href={call.link_url} target="_blank" rel="noreferrer" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>
        {phase === 'live' ? 'Join now' : 'Join'}
      </a>
    </div>
  )
}
