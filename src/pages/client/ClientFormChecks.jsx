import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientFormChecks() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [open, setOpen] = useState(null)
  const [videoUrl, setVideoUrl] = useState({})
  const [comments, setComments] = useState({})
  const [reply, setReply] = useState('')
  const bottomRef = useRef(null)

  async function load() {
    const { data } = await supabase.from('form_checks').select('*').eq('client_id', profile.id).order('created_at', { ascending: false })
    setItems(data || [])
  }
  useEffect(() => { if (profile) load() }, [profile])

  async function upload() {
    if (!file) return
    setUploading(true)
    const path = `${profile.id}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('form-checks').upload(path, file)
    if (!upErr) {
      await supabase.from('form_checks').insert({ client_id: profile.id, title: title.trim() || 'Form check', notes: notes.trim(), video_path: path })
      setTitle(''); setNotes(''); setFile(null)
      load()
    }
    setUploading(false)
  }

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
    const { data: c } = await supabase.from('form_check_comments').select('*').eq('form_check_id', itemId).order('created_at')
    setComments(cm => ({ ...cm, [itemId]: c || [] }))
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">Coach review</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Form Checks</h1>
      </header>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>Upload a lift</div>
        <input placeholder="What lift? (e.g. Back Squat 315x3)" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea rows="2" placeholder="Anything you want your coach to look at" value={notes} onChange={e => setNotes(e.target.value)} />
        <label className="btn-ghost" style={{ textAlign: 'center' }}>
          {file ? file.name : 'Choose video'}
          <input type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] || null)} />
        </label>
        <button className="btn" onClick={upload} disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Send to coach'}</button>
      </div>

      {items.map(item => (
        <div className="card" key={item.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => openItem(item)}>
            <div>
              <strong style={{ fontSize: 14.5 }}>{item.title}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{new Date(item.created_at).toLocaleDateString()}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: item.reviewed ? 'var(--green)' : 'var(--orange-hot)' }}>
              {item.reviewed ? 'Reviewed' : 'Pending'}
            </span>
          </div>

          {open === item.id && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              {videoUrl[item.id]
                ? <video src={videoUrl[item.id]} controls style={{ width: '100%', borderRadius: 8, maxHeight: 360 }} />
                : <p className="muted" style={{ fontSize: 13 }}>Loading video…</p>}
              {item.notes && <p style={{ fontSize: 13.5, marginTop: 8 }}>{item.notes}</p>}

              <div className="chat-scroll" style={{ marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
                {(comments[item.id] || []).map(c => (
                  <div key={c.id} className={`bubble ${c.sender_id === profile.id ? 'me' : 'them'}`}>{c.body}</div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input placeholder="Reply to your coach…" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(item.id)} />
                <button className="btn" onClick={() => send(item.id)}>Send</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No form checks yet — upload a lift above for your coach to review.</p>}
    </div>
  )
}
