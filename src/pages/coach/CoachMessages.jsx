import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function CoachMessages() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [active, setActive] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name')
      .then(({ data }) => setClients(data || []))
  }, [])

  useEffect(() => {
    if (!profile || !active) return
    supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${profile.id},recipient_id.eq.${active.id}),and(sender_id.eq.${active.id},recipient_id.eq.${profile.id})`)
      .order('created_at')
      .then(({ data }) => setMsgs(data || []))

    const channel = supabase.channel('coach-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if ((m.sender_id === active.id && m.recipient_id === profile.id) ||
            (m.sender_id === profile.id && m.recipient_id === active.id)) {
          setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile, active])

  useEffect(() => { bottomRef.current?.scrollIntoView() }, [msgs])

  async function send() {
    if (!text.trim() || !active) return
    const body = text.trim()
    setText('')
    await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: active.id, body })
  }

  return (
    <div>
      <div className="eyebrow">Roster</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Messages</h1>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {clients.map(c => (
            <button key={c.id} className={active?.id === c.id ? 'btn' : 'btn-ghost'}
              style={{ textAlign: 'left', fontSize: 13.5 }} onClick={() => setActive(c)}>
              {c.full_name || c.id.slice(0, 8)}
            </button>
          ))}
          {clients.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No clients yet.</p>}
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '65vh' }}>
          {!active
            ? <p className="muted" style={{ margin: 'auto' }}>Select a client.</p>
            : <>
                <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
                  {msgs.map(m => (
                    <div key={m.id} className={`bubble ${m.sender_id === profile.id ? 'me' : 'them'}`}>{m.body}</div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
                  <input placeholder={`Message ${active.full_name}…`} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
                  <button className="btn" onClick={send}>Send</button>
                </div>
              </>}
        </div>
      </div>
    </div>
  )
}
