import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyEvent } from '../../lib/push'
import Avatar from '../Avatar'
import { useAuth } from '../../context/AuthContext'
import VoiceRecorder from '../../lib/VoiceRecorder'

// Group unread messages (newest first) by who sent them.
export function unreadBySender(rows) {
  const out = {}
  for (const m of rows) {
    const k = m.sender_id
    if (!out[k]) out[k] = { count: 0, last: m.created_at, preview: previewOf(m.body) }
    out[k].count++
    if (m.created_at > out[k].last) { out[k].last = m.created_at; out[k].preview = previewOf(m.body) }
  }
  return out
}
export function addUnread(u, m) {
  const cur = u[m.sender_id]
  return { ...u, [m.sender_id]: { count: (cur?.count || 0) + 1, last: m.created_at, preview: previewOf(m.body) } }
}
const previewOf = body => String(body || '').replace(/\s+/g, ' ').trim().slice(0, 60)
// Clients with unread messages first (newest message on top), then everyone else as listed.
export function sortByUnread(list, unread) {
  return list.map((c, i) => [c, i]).sort((a, b) => {
    const ua = unread[a[0].id], ub = unread[b[0].id]
    if (ua && ub) return String(ub.last).localeCompare(String(ua.last))
    if (ua) return -1
    if (ub) return 1
    return a[1] - b[1]
  }).map(x => x[0])
}
async function markRead(me, other) {
  const { error } = await supabase.rpc('mark_messages_read', { other_id: other })
  if (error) await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('recipient_id', me).eq('sender_id', other).is('read_at', null)
}

export default function CoachMessages() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [active, setActive] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [audioUrls, setAudioUrls] = useState({})
  const [fileUrls, setFileUrls] = useState({})
  const [attaching, setAttaching] = useState(false)
  const [templates, setTemplates] = useState([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [newTpl, setNewTpl] = useState({ label: '', body: '' })
  const bottomRef = useRef(null)
  const [showArchived, setShowArchived] = useState(false)
  const [unread, setUnread] = useState({})   // clientId -> { count, last: created_at, preview }
  const activeRef = useRef(null)
  activeRef.current = active

  // Unread messages from each client: loaded once, then kept live so a new
  // message lights up that client's card without opening their thread.
  useEffect(() => {
    if (!profile) return
    supabase.from('messages').select('sender_id, body, created_at').eq('recipient_id', profile.id).is('read_at', null)
      .order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => setUnread(unreadBySender(data || [])))
    const channel = supabase.channel('coach-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if (m.recipient_id !== profile.id) return
        if (activeRef.current?.id === m.sender_id) { markRead(profile.id, m.sender_id); return }   // their thread is open
        setUnread(u => addUnread(u, m))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile])

  function openClient(c) {
    setActive(c)
    if (unread[c.id]) {
      setUnread(u => { const n = { ...u }; delete n[c.id]; return n })
      markRead(profile.id, c.id)
    }
  }

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, avatar_url, status').eq('role', 'client').order('full_name')
      .then(({ data }) => setClients(data || []))
    supabase.from('message_templates').select('*').order('created_at')
      .then(({ data }) => setTemplates(data || []))
  }, [])

  async function saveTemplate() {
    if (!newTpl.label.trim() || !newTpl.body.trim()) return
    await supabase.from('message_templates').insert({ label: newTpl.label.trim(), body: newTpl.body.trim() })
    setNewTpl({ label: '', body: '' })
    const { data } = await supabase.from('message_templates').select('*').order('created_at')
    setTemplates(data || [])
  }
  async function deleteTemplate(id) {
    await supabase.from('message_templates').delete().eq('id', id)
    setTemplates(t => t.filter(x => x.id !== id))
  }
  function useTemplate(body) {
    setText(t => t ? t + ' ' + body : body)
    setShowTemplates(false)
  }

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
    const { error } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: active.id, body })
    if (!error) notifyEvent('message', { to: active.id })
  }

  async function sendVoice(path) {
    if (!active) { alert('Select a client first.'); return }
    const { error } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: active.id, body: '🎙 Voice note', msg_type: 'audio', audio_path: path })
    if (error) alert('Could not send voice note: ' + error.message + '\n\nIf this mentions a missing column, the database update (migration14.sql) needs to be run in Supabase first.')
    else notifyEvent('message', { to: active.id })
  }

  async function playAudio(m) {
    if (audioUrls[m.id]) return
    const { data } = await supabase.storage.from('voice-notes').createSignedUrl(m.audio_path, 3600)
    if (data?.signedUrl) setAudioUrls(u => ({ ...u, [m.id]: data.signedUrl }))
  }

  async function openFile(m) {
    if (fileUrls[m.id]) { window.open(fileUrls[m.id], '_blank'); return }
    const { data } = await supabase.storage.from('message-files').createSignedUrl(m.file_path, 3600)
    if (data?.signedUrl) { setFileUrls(u => ({ ...u, [m.id]: data.signedUrl })); window.open(data.signedUrl, '_blank') }
  }

  async function sendFile(file) {
    if (!file || !active) return
    setAttaching(true)
    const path = `${profile.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('message-files').upload(path, file)
    if (error) { alert('Could not attach file: ' + error.message); setAttaching(false); return }
    const { error: msgErr } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: active.id, body: `📎 ${file.name}`, msg_type: 'file', file_path: path, file_name: file.name })
    if (msgErr) alert('Could not send: ' + msgErr.message)
    else notifyEvent('message', { to: active.id })
    setAttaching(false)
  }

  return (
    <div>
      <div className="eyebrow">Roster</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Messages</h1>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.keys(unread).length > 0 && (
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--orange-hot)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 2px 2px' }}>
              {Object.keys(unread).length} {Object.keys(unread).length === 1 ? 'client has' : 'clients have'} new messages
            </div>
          )}
          {sortByUnread(clients.filter(c => showArchived || c.status !== 'exited' || unread[c.id]), unread).map(c => {
            const u = unread[c.id], isActive = active?.id === c.id
            return (
              <button key={c.id} className={isActive ? 'btn' : 'btn-ghost'} aria-label={u ? `${c.full_name}, ${u.count} new` : c.full_name}
                style={{ textAlign: 'left', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8, position: 'relative',
                  ...(u && !isActive ? { borderColor: 'var(--orange)', background: 'rgba(255,106,0,0.14)', boxShadow: '0 0 0 1px var(--orange) inset' } : {}) }}
                onClick={() => openClient(c)}>
                <Avatar url={c.avatar_url} name={c.full_name} size={26} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: u ? 800 : undefined }}>{c.full_name || c.id.slice(0, 8)}</span>
                  {u && <span style={{ display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--orange-hot)', fontWeight: 600 }}>{u.preview || 'New message'}</span>}
                </span>
                {u && <span style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 10, background: 'var(--orange)', color: '#000', fontSize: 11.5, fontWeight: 900, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{u.count > 99 ? '99+' : u.count}</span>}
              </button>
            )
          })}
          {clients.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No clients yet.</p>}
          {clients.some(c => c.status === 'exited') && (
            <button onClick={() => setShowArchived(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, textAlign: 'left', padding: '6px 2px', cursor: 'pointer', textDecoration: 'underline' }}>
              {showArchived ? 'Hide archived' : `Show archived (${clients.filter(c => c.status === 'exited').length})`}
            </button>
          )}
        </div>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '65vh' }}>
          {!active
            ? <p className="muted" style={{ margin: 'auto' }}>Select a client.</p>
            : <>
                <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
                  {msgs.map(m => (
                    <div key={m.id} className={`bubble ${m.sender_id === profile.id ? 'me' : 'them'}`}>
                      {m.msg_type === 'audio' ? (
                        audioUrls[m.id]
                          ? <audio src={audioUrls[m.id]} controls style={{ height: 34, maxWidth: 220 }} />
                          : <button onClick={() => playAudio(m)} style={{ background: 'none', color: 'inherit', fontWeight: 700, fontSize: 13 }}>▶ Voice note</button>
                      ) : m.msg_type === 'file' ? (
                        <button onClick={() => openFile(m)} style={{ background: 'none', color: 'inherit', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>📎 {m.file_name || 'Attachment'}</button>
                      ) : m.body}
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                {showTemplates && (
                  <div style={{ background: 'var(--steel)', borderRadius: 8, padding: 10, marginBottom: 8, maxHeight: 220, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="eyebrow" style={{ fontSize: 10 }}>Quick replies</span>
                      <button onClick={() => setShowTemplates(false)} style={{ background: 'none', color: 'var(--muted)', fontSize: 12 }}>✕</button>
                    </div>
                    {templates.map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                        <button onClick={() => useTemplate(t.body)} style={{ background: 'none', textAlign: 'left', flex: 1, fontSize: 12.5 }}>
                          <strong>{t.label}</strong>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{t.body.length > 60 ? t.body.slice(0,60) + '…' : t.body}</div>
                        </button>
                        <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', color: 'var(--red)', fontSize: 11 }}>✕</button>
                      </div>
                    ))}
                    {templates.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No templates yet — add one below.</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      <input placeholder="Label (e.g. Check-in reminder)" value={newTpl.label} onChange={e => setNewTpl({ ...newTpl, label: e.target.value })} style={{ padding: '6px 8px', fontSize: 12 }} />
                      <textarea rows="2" placeholder="Message text" value={newTpl.body} onChange={e => setNewTpl({ ...newTpl, body: e.target.value })} style={{ fontSize: 12 }} />
                      <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={saveTemplate}>Save template</button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
                  <button className="btn-ghost" style={{ padding: '10px 12px' }} title="Quick replies" onClick={() => setShowTemplates(s => !s)}>💬</button>
                  <input placeholder={`Message ${active.full_name}…`} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
                  <label className="btn-ghost" style={{ padding: '10px 14px', cursor: 'pointer' }} title="Attach a file">
                    {attaching ? '…' : '📎'}
                    <input type="file" style={{ display: 'none' }} disabled={attaching} onChange={e => sendFile(e.target.files[0])} />
                  </label>
                  <VoiceRecorder userId={profile.id} onSent={sendVoice} />
                  <button className="btn" onClick={send}>Send</button>
                </div>
              </>}
        </div>
      </div>
    </div>
  )
}
