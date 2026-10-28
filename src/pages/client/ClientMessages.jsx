import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyEvent } from '../../lib/push'
import { useAuth } from '../../context/AuthContext'
import VoiceRecorder from '../../lib/VoiceRecorder'
import GroupThread from '../GroupThread'

// Stamp the coach's messages as read. The function (Update 134) works without an
// UPDATE policy on messages; the plain update is the fallback until it's installed.
async function markRead(me, other) {
  const { error } = await supabase.rpc('mark_messages_read', { other_id: other })
  if (error) await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('recipient_id', me).eq('sender_id', other).is('read_at', null)
}

export default function ClientMessages() {
  const { profile } = useAuth()
  const [coachId, setCoachId] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [audioUrls, setAudioUrls] = useState({})
  const [fileUrls, setFileUrls] = useState({})
  const [attaching, setAttaching] = useState(false)
  const bottomRef = useRef(null)
  // Group chats this client is in. Empty (and the tab strip hidden) for anyone
  // not in a group, or before migration 137 is run.
  const [groups, setGroups] = useState([])
  const [tab, setTab] = useState('coach')   // 'coach' or a group id

  function loadGroups() {
    supabase.rpc('my_groups').then(({ data, error }) => { if (!error) setGroups(data || []) })
  }
  useEffect(() => {
    if (!profile) return
    loadGroups()
    const channel = supabase.channel('client-group-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, () => loadGroups())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [profile])

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

    // mark any incoming unread messages as read now that this tab is open
    markRead(profile.id, coachId)

    const channel = supabase.channel('client-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const m = payload.new
        if ((m.sender_id === coachId && m.recipient_id === profile.id) ||
            (m.sender_id === profile.id && m.recipient_id === coachId)) {
          setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          if (m.sender_id === coachId) markRead(profile.id, coachId)
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
    const { error } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: coachId, body })
    if (!error) notifyEvent('message', { to: coachId })
  }

  async function sendVoice(path) {
    if (!coachId) { alert('No coach found to send to yet.'); return }
    const { error } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: coachId, body: '🎙 Voice note', msg_type: 'audio', audio_path: path })
    if (error) alert('Could not send voice note: ' + error.message + '\n\nIf this mentions a missing column, the database update (migration14.sql) needs to be run in Supabase first.')
    else notifyEvent('message', { to: coachId })
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
    if (!file || !coachId) return
    setAttaching(true)
    const path = `${profile.id}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('message-files').upload(path, file)
    if (error) { alert('Could not attach file: ' + error.message); setAttaching(false); return }
    const { error: msgErr } = await supabase.from('messages').insert({ sender_id: profile.id, recipient_id: coachId, body: `📎 ${file.name}`, msg_type: 'file', file_path: path, file_name: file.name })
    if (msgErr) alert('Could not send: ' + msgErr.message)
    else notifyEvent('message', { to: coachId })
    setAttaching(false)
  }

  const activeGroup = tab !== 'coach' ? groups.find(g => g.id === tab) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 130px)' }}>
      <header style={{ marginBottom: 12 }}>
        <div className="eyebrow">{activeGroup ? 'Group' : 'Coach'}</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Messages</h1>
      </header>
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 4, flexShrink: 0 }}>
          {[{ id: 'coach', name: 'Coach', unread: 0 }, ...groups].map(g => {
            const on = tab === g.id
            return (
              <button key={g.id} className={on ? 'btn' : 'btn-ghost'}
                style={{ padding: '7px 12px', fontSize: 13, whiteSpace: 'nowrap', position: 'relative', flexShrink: 0 }}
                onClick={() => { setTab(g.id); if (g.id !== 'coach') setGroups(list => list.map(x => x.id === g.id ? { ...x, unread: 0 } : x)) }}>
                {g.id === 'coach' ? '💬 ' : '👥 '}{g.name}
                {g.unread > 0 && !on && <span style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRadius: 4, background: 'var(--orange)' }} />}
              </button>
            )
          })}
        </div>
      )}
      {activeGroup ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <GroupThread key={activeGroup.id} group={activeGroup} profile={profile} height="100%" />
        </div>
      ) : <>
      <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 10 }}>
        {msgs.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No messages yet. Say what's up.</p>}
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
      <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
        <input placeholder="Message your coach…" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <label className="btn-ghost" style={{ padding: '10px 14px', cursor: 'pointer' }} title="Attach a file">
          {attaching ? '…' : '📎'}
          <input type="file" style={{ display: 'none' }} disabled={attaching} onChange={e => sendFile(e.target.files[0])} />
        </label>
        <VoiceRecorder userId={profile.id} onSent={sendVoice} />
        <button className="btn" style={{ padding: '12px 18px' }} onClick={send}>Send</button>
      </div>
      </>}
    </div>
  )
}
