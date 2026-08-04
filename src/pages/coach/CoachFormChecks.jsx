import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function CoachFormChecks() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [clientsById, setClientsById] = useState({})
  const [filter, setFilter] = useState('pending')
  const [open, setOpen] = useState(null)
  const [videoUrl, setVideoUrl] = useState({})
  const [comments, setComments] = useState({})
  const [reply, setReply] = useState('')
  const bottomRef = useRef(null)

  async function load() {
    const [{ data: items }, { data: clients }] = await Promise.all([
      supabase.from('form_checks').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client'),
    ])
    setItems(items || [])
    setClientsById(Object.fromEntries((clients || []).map(c => [c.id, c.full_name])))
  }
  useEffect(() => { load() }, [])

  async function openItem(item) {
    if (open === item.id) { setOpen(null); return }
    setOpen(item.id)
    if (!videoUrl[item.id]) {
      const { data } = await supabase.storage.from('form-checks').createSignedUrl(item.video_path, 3600)
      if (data?.signedUrl) setVideoUrl(v => ({ ...v, [item.id]: data.signedUrl }))
    }
    const { data: c } = await supabase.from('form_check_comments').select('*').eq('form_check_id', item.id).order('created_at')
    setComments(cm => ({ ...cm, [item.id]: c || [] }))
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }

  async function send(itemId) {
    if (!reply.trim()) return
    const body = reply.trim()
    setReply('')
    await supabase.from('form_check_comments').insert({ form_check_id: itemId, sender_id: profile.id, body })
    await supabase.from('form_checks').update({ reviewed: true }).eq('id', itemId)
    const { data: c } = await supabase.from('form_check_comments').select('*').eq('form_check_id', itemId).order('created_at')
    setComments(cm => ({ ...cm, [itemId]: c || [] }))
    load()
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }

  async function markReviewed(itemId, val) {
    await supabase.from('form_checks').update({ reviewed: val }).eq('id', itemId)
    load()
  }

  const filtered = items.filter(i => filter === 'all' ? true : filter === 'pending' ? !i.reviewed : i.reviewed)

  return (
    <div>
      <div className="eyebrow">Review</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 16px' }}>Form Checks</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['pending', 'reviewed', 'all'].map(f => (
          <button key={f} className={filter === f ? 'btn' : 'btn-ghost'} style={{ textTransform: 'capitalize' }} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(item => (
          <div className="card" key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap', gap: 8 }} onClick={() => openItem(item)}>
              <div>
                <strong style={{ fontSize: 15 }}>{clientsById[item.client_id] || 'Client'}</strong>
                <span className="muted" style={{ marginLeft: 8 }}>{item.title}</span>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{new Date(item.created_at).toLocaleDateString()}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: item.reviewed ? 'var(--green)' : 'var(--orange-hot)' }}>
                {item.reviewed ? 'Reviewed' : 'Needs review'}
              </span>
            </div>

            {open === item.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                {videoUrl[item.id]
                  ? <video src={videoUrl[item.id]} controls style={{ width: '100%', borderRadius: 8, maxHeight: 420 }} />
                  : <p className="muted" style={{ fontSize: 13 }}>Loading video…</p>}
                {item.notes && <p style={{ fontSize: 13.5, marginTop: 8 }}><span className="muted">Client note: </span>{item.notes}</p>}

                <div className="chat-scroll" style={{ marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
                  {(comments[item.id] || []).map(c => (
                    <div key={c.id} className={`bubble ${c.sender_id === profile.id ? 'me' : 'them'}`}>{c.body}</div>
                  ))}
                  <div ref={bottomRef} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input placeholder="Leave feedback…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(item.id)} />
                  <button className="btn" onClick={() => send(item.id)}>Send</button>
                  {item.reviewed
                    ? <button className="btn-ghost" onClick={() => markReviewed(item.id, false)}>Mark pending</button>
                    : <button className="btn-ghost" onClick={() => markReviewed(item.id, true)}>Mark reviewed</button>}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="card muted">Nothing here.</div>}
      </div>
    </div>
  )
}
