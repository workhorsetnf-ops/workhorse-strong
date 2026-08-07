import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import VoiceRecorder from '../../lib/VoiceRecorder'

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

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name')
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
    await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: active.id, body })
  }

  async function sendVoice(path) {
    if (!active) { alert('Select a client first.'); return }
    const { error } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: active.id, body: '🎙 Voice note', msg_type: 'audio', audio_path: path })
    if (error) alert('Could not send voice note: ' + error.message + '\n\nIf this mentions a missing column, the database update (migration14.sql) needs to be run in Supabase first.')
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
    setAttaching(false)
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
