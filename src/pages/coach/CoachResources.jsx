import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CoachResources() {
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const { data } = await supabase.from('resources').select('*').order('created_at', { ascending: false })
    setItems(data || [])
  }
  useEffect(() => { load() }, [])

  async function upload() {
    if (!file || !title.trim()) return
    setUploading(true)
    const path = `${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('resources').upload(path, file)
    if (!upErr) {
      const { error } = await supabase.from('resources').insert({ title: title.trim(), category: category.trim(), description: description.trim(), file_path: path })
      if (error) alert('Could not save: ' + error.message)
      setTitle(''); setCategory(''); setDescription(''); setFile(null)
      load()
    } else {
      alert('Upload failed: ' + upErr.message)
    }
    setUploading(false)
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.title}"?`)) return
    await supabase.storage.from('resources').remove([item.file_path])
    await supabase.from('resources').delete().eq('id', item.id)
    load()
  }

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort()

  return (
    <div>
      <div className="eyebrow">Client materials</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Resources</h1>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>Upload a PDF</span>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <input placeholder="Title (e.g. Cutting Weight Safely for TV)" value={title} onChange={e => setTitle(e.target.value)} />
          <input placeholder="Category (e.g. Nutrition, Weigh-ins)" list="res-cats" value={category} onChange={e => setCategory(e.target.value)} />
          <datalist id="res-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <textarea rows="2" placeholder="Short description shown to clients" value={description} onChange={e => setDescription(e.target.value)} />
        <label className="btn-ghost" style={{ textAlign: 'center' }}>
          {file ? file.name : 'Choose PDF'}
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0] || null)} />
        </label>
        <button className="btn" onClick={upload} disabled={!file || !title.trim() || uploading}>{uploading ? 'Uploading…' : 'Add to library'}</button>
      </div>

      <table className="data">
        <thead><tr><th>Title</th><th>Category</th><th>Description</th><th></th></tr></thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id}>
              <td style={{ fontWeight: 700 }}>{i.title}</td>
              <td className="muted">{i.category || '—'}</td>
              <td className="muted" style={{ maxWidth: 320 }}>{i.description || '—'}</td>
              <td><button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(i)}>✕</button></td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="4" className="muted">Nothing uploaded yet.</td></tr>}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Everything here is visible to all of your clients.</p>
    </div>
  )
}
