import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { notifyEvent } from '../lib/push'
import VoiceRecorder from '../lib/VoiceRecorder'
import Avatar from './Avatar'

// One group chat, used by both the coach and client message pages.
// Everyone in the group sees every message. Voice notes and files live in the
// private group-files bucket under <group id>/<sender id>/, which only members
// (and the coach) can open.

export const GROUP_BUCKET = 'group-files'

// "Anthony", or the first word of a name; the coach is labelled "Coach" for clients.
export function senderLabel(p, viewerIsCoach) {
  if (!p) return 'Former member'
  if (p.role === 'coach' && !viewerIsCoach) return 'Coach'
  return String(p.full_name || '').trim() || 'Member'
}

// Show the sender's name above the first of a run of messages from them.
export function showNameAt(msgs, i, me) {
  const m = msgs[i]
  if (m.sender_id === me) return false
  return i === 0 || msgs[i - 1].sender_id !== m.sender_id
}

export default function GroupThread({ group, profile, isCoach = false, onManage, height = '65vh' }) {
  const [msgs, setMsgs] = useState([])
  const [people, setPeople] = useState({})     // id -> { full_name, avatar_url, role }
  const [text, setText] = useState('')
  const [urls, setUrls] = useState({})         // message id -> signed url
  const [attaching, setAttaching] = useState(false)
  const bottomRef = useRef(null)
  const gid = group.id
  const folder = `${gid}/${profile.id}`

  useEffect(() => {
    let alive = true
    setMsgs([]); setUrls({})
    supabase.from('group_messages').select('*').eq('group_id', gid).order('created_at').limit(500)
      .then(({ data }) => { if (alive) setMsgs(data || []) })
    supabase.rpc('group_member_profiles', { gid })
      .then(({ data }) => { if (alive) setPeople(Object.fromEntries((data || []).map(p => [p.id, p]))) })
    supabase.rpc('mark_group_read', { gid })

    const channel = supabase.channel(`group-${gid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${gid}` }, payload => {
        const m = payload.new
        setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
        if (m.sender_id !== profile.id) supabase.rpc('mark_group_read', { gid })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, payload => {
        setMsgs(prev => prev.filter(x => x.id !== payload.old.id))
      })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [gid, profile.id])

  useEffect(() => { bottomRef.current?.scrollIntoView() }, [msgs])

  async function post(row) {
    const { data, error } = await supabase.from('group_messages').insert({ group_id: gid, sender_id: profile.id, ...row }).select().single()
    if (error) { alert('Could not send: ' + error.message); return false }
    setMsgs(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data])
    notifyEvent('group', { group: gid })
    return true
  }

  async function send() {
    const body = text.trim()
    if (!body) return
    setText('')
    if (!(await post({ body }))) setText(body)
  }

  async function sendVoice(path) {
    await post({ body: '🎙 Voice note', msg_type: 'audio', file_path: path })
  }

  async function sendFile(file) {
    if (!file) return
    setAttaching(true)
    const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
    const { error } = await supabase.storage.from(GROUP_BUCKET).upload(path, file)
    if (error) alert('Could not attach file: ' + error.message)
    else await post({ body: `📎 ${file.name}`, msg_type: 'file', file_path: path, file_name: file.name })
    setAttaching(false)
  }

  async function signed(m) {
    if (urls[m.id]) return urls[m.id]
    const { data } = await supabase.storage.from(GROUP_BUCKET).createSignedUrl(m.file_path, 3600)
    if (data?.signedUrl) setUrls(u => ({ ...u, [m.id]: data.signedUrl }))
    return data?.signedUrl
  }

  async function remove(m) {
    if (!confirm('Delete this message for everyone?')) return
    const { error } = await supabase.from('group_messages').delete().eq('id', m.id)
    if (error) alert('Could not delete: ' + error.message)
    else setMsgs(prev => prev.filter(x => x.id !== m.id))
  }

  const memberCount = Object.keys(people).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--line)', marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ fontSize: 16, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
            {memberCount > 0 && ` · ${Object.values(people).map(p => senderLabel(p, isCoach).split(' ')[0]).join(', ')}`}
          </span>
        </div>
        {group.archived && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}>ARCHIVED</span>}
        {isCoach && onManage && <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={onManage}>Manage</button>}
      </div>

      <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 10, minHeight: 0 }}>
        {msgs.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No messages yet. Get the conversation going.</p>}
        {msgs.map((m, i) => {
          const mine = m.sender_id === profile.id
          const p = people[m.sender_id]
          return (
            <Fragment key={m.id}>
              {showNameAt(msgs, i, profile.id) && (
                <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 -4px', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
                  <Avatar url={p?.avatar_url} name={p?.full_name} size={18} />{senderLabel(p, isCoach)}
                </div>
              )}
              <div className={`bubble ${mine ? 'me' : 'them'}`}>
                {m.msg_type === 'audio' ? (
                  urls[m.id]
                    ? <audio src={urls[m.id]} controls autoPlay style={{ height: 34, maxWidth: 220 }} />
                    : <button onClick={() => signed(m)} style={{ background: 'none', color: 'inherit', fontWeight: 700, fontSize: 13 }}>▶ Voice note</button>
                ) : m.msg_type === 'file' ? (
                  <button onClick={async () => { const u = await signed(m); if (u) window.open(u, '_blank') }}
                    style={{ background: 'none', color: 'inherit', fontWeight: 700, fontSize: 13, textAlign: 'left' }}>📎 {m.file_name || 'Attachment'}</button>
                ) : <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>}
                {(mine || isCoach) && (
                  <button className="bubble-del" onClick={() => remove(m)} title="Delete for everyone" aria-label="Delete message">✕</button>
                )}
              </div>
            </Fragment>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {group.archived ? (
        <p className="muted" style={{ fontSize: 13, textAlign: 'center', padding: '10px 0' }}>This group is archived — it's read-only.</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
          <input placeholder={`Message ${group.name}…`} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
          <label className="btn-ghost" style={{ padding: '10px 14px', cursor: 'pointer' }} title="Attach a file">
            {attaching ? '…' : '📎'}
            <input type="file" style={{ display: 'none' }} disabled={attaching} onChange={e => { sendFile(e.target.files[0]); e.target.value = '' }} />
          </label>
          <VoiceRecorder userId={profile.id} bucket={GROUP_BUCKET} folder={folder} onSent={sendVoice} />
          <button className="btn" onClick={send}>Send</button>
        </div>
      )}
    </div>
  )
}
