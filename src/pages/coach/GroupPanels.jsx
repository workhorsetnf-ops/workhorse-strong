import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { notifyEvent } from '../../lib/push'
import RecipientPicker from './RecipientPicker'

// Coach-only panels on the Messages page: start a group, manage one, and
// broadcast (the same 1-on-1 message to many clients, replies come back private).

// Who to add and who to take out when the member list changes. The coach is
// never removed — they stay in every group so it shows in their inbox.
export function memberDiff(current, wanted, coachId) {
  const cur = new Set(current), want = new Set(wanted)
  want.add(coachId)
  return {
    add: [...want].filter(id => !cur.has(id)),
    remove: [...cur].filter(id => !want.has(id) && id !== coachId),
  }
}

export function NewGroup({ clients, coachId, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState(new Set())
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim() || !members.size) return
    setBusy(true)
    const { data: g, error } = await supabase.from('message_groups').insert({ name: name.trim(), created_by: coachId }).select().single()
    if (error) { alert('Could not create the group: ' + error.message + '\n\nIf this mentions message_groups, run migration_update137_group_messages.sql in Supabase first.'); setBusy(false); return }
    const rows = [coachId, ...members].map(profile_id => ({ group_id: g.id, profile_id }))
    const { error: mErr } = await supabase.from('message_group_members').insert(rows)
    setBusy(false)
    if (mErr) { alert('Group created, but adding members failed: ' + mErr.message); return }
    onCreated(g)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ fontSize: 18 }}>New group</h2>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Everyone in the group sees and replies to every message.</p>
      <input placeholder="Group name (e.g. Main Event crew)" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      <RecipientPicker clients={clients} selected={members} onChange={setMembers} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy || !name.trim() || !members.size} onClick={create}>
          {busy ? 'Creating…' : `Create group · ${members.size} client${members.size === 1 ? '' : 's'}`}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export function ManageGroup({ group, clients, coachId, onSaved, onDeleted, onClose }) {
  const [name, setName] = useState(group.name)
  const [current, setCurrent] = useState([])
  const [members, setMembers] = useState(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('message_group_members').select('profile_id').eq('group_id', group.id).then(({ data }) => {
      const ids = (data || []).map(r => r.profile_id)
      setCurrent(ids)
      setMembers(new Set(ids.filter(id => id !== coachId)))
    })
  }, [group.id, coachId])

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    const { add, remove } = memberDiff(current, [...members], coachId)
    const steps = []
    if (name.trim() !== group.name) steps.push(supabase.from('message_groups').update({ name: name.trim() }).eq('id', group.id))
    if (add.length) steps.push(supabase.from('message_group_members').insert(add.map(profile_id => ({ group_id: group.id, profile_id }))))
    if (remove.length) steps.push(supabase.from('message_group_members').delete().eq('group_id', group.id).in('profile_id', remove))
    const results = await Promise.all(steps)
    setBusy(false)
    const err = results.find(r => r.error)?.error
    if (err) { alert('Could not save: ' + err.message); return }
    onSaved({ ...group, name: name.trim() })
  }

  async function setArchived(archived) {
    const { error } = await supabase.from('message_groups').update({ archived }).eq('id', group.id)
    if (error) alert('Could not update: ' + error.message)
    else onSaved({ ...group, archived })
  }

  async function remove() {
    if (!confirm(`Delete "${group.name}" and every message in it? This can't be undone. Archive it instead to keep the history read-only.`)) return
    const { error } = await supabase.from('message_groups').delete().eq('id', group.id)
    if (error) alert('Could not delete: ' + error.message)
    else onDeleted(group.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18 }}>Manage group</h2>
        <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12.5 }} onClick={onClose}>Back to chat</button>
      </div>
      <input value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Removed members lose access to the whole history. People you add can read everything already sent.</p>
      <RecipientPicker clients={clients} selected={members} onChange={setMembers} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button className="btn-ghost" onClick={() => setArchived(!group.archived)}>{group.archived ? 'Unarchive' : 'Archive (read-only)'}</button>
        <button className="btn-ghost" style={{ color: 'var(--red)', marginLeft: 'auto' }} onClick={remove}>Delete group</button>
      </div>
    </div>
  )
}

export function Broadcast({ clients, coachId, onDone, onCancel }) {
  const [to, setTo] = useState(new Set())
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const text = body.trim()
    if (!text || !to.size) return
    if (!confirm(`Send this to ${to.size} client${to.size === 1 ? '' : 's'}? Each gets it as a private message from you.`)) return
    setBusy(true)
    const ids = [...to]
    const { error } = await supabase.from('messages').insert(ids.map(recipient_id => ({ sender_id: coachId, recipient_id, body: text })))
    setBusy(false)
    if (error) { alert('Could not send: ' + error.message); return }
    notifyEvent('broadcast', { to: ids })
    onDone(ids.length)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ fontSize: 18 }}>📣 Broadcast</h2>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Sends the same message to each client's private thread. Replies come back to you one-on-one — clients don't see each other.</p>
      <textarea rows={4} placeholder="Message…" value={body} onChange={e => setBody(e.target.value)} />
      <RecipientPicker clients={clients} selected={to} onChange={setTo} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy || !body.trim() || !to.size} onClick={send}>
          {busy ? 'Sending…' : `Send to ${to.size} client${to.size === 1 ? '' : 's'}`}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
