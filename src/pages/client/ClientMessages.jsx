import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientMessages() {
  const { profile } = useAuth()
  const [coachId, setCoachId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.from('profiles').select('id').eq('role', 'coach').limit(1).maybeSingle()
      .then(({ data }) => setCoachId(data?.id || null))
  }, [])

  useEffect(() => {
    if (!profile || !coachId) return
    supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${coachId}),and(sender_id.eq.${coachId},recipient_id.eq.${profile.id})`)
      .order('created_at')
      .then(({ data }) => setMsgs(data || []))

    const channel = supabase.channel('client-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if ((m.sender_id === coachId && m.recipient_id === profile.id) ||
            (m.sender_id === profile.id && m.recipient_id === coachId)) {
          setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile, coachId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send() {
    if (!text.trim() || !coachId) return
    const body = text.trim()
    setText('')
    await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: coachId, body })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 130px)' }}>
      <header style={{ marginBottom: 12 }}>
        <div className="eyebrow">Coach</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Messages</h1>
      </header>
      <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
        {msgs.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No messages yet. Say what's up.</p>}
        {msgs.map(m => (
          <div key={m.id} className={`bubble ${m.sender_id === profile.id ? 'me' : 'them'}`}>{m.body}</div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
        <input placeholder="Message your coach…" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="btn" style={{ padding: '12px 18px' }} onClick={send}>Send</button>
      </div>
    </div>
  )
}
