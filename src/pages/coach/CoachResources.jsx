import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CoachResources() {
  const [tab, setTab] = useState('resources')

  // --- resources (PDFs) ---
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)

  // --- FAQ ---
  const [faqs, setFaqs] = useState([])
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: '' })
  const [editingFaq, setEditingFaq] = useState(null)

  async function load() {
    const { data } = await supabase.from('resources').select('*').order('created_at', { ascending: false })
    setItems(data || [])
  }
  async function loadFaqs() {
    const { data } = await supabase.from('faq_items').select('*').order('position')
    setFaqs(data || [])
  }
  useEffect(() => { load(); loadFaqs() }, [])

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

  async function saveFaq() {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) return
    const row = { question: faqForm.question.trim(), answer: faqForm.answer.trim(), category: faqForm.category.trim() }
    if (editingFaq) await supabase.from('faq_items').update(row).eq('id', editingFaq)
    else await supabase.from('faq_items').insert({ ...row, position: faqs.length })
    setFaqForm({ question: '', answer: '', category: '' }); setEditingFaq(null)
    loadFaqs()
  }
  function editFaq(f) {
    setEditingFaq(f.id)
    setFaqForm({ question: f.question, answer: f.answer, category: f.category || '' })
  }
  async function removeFaq(id) {
    if (!confirm('Delete this FAQ?')) return
    await supabase.from('faq_items').delete().eq('id', id)
    loadFaqs()
  }

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort()

  return (
    <div>
      <div className="eyebrow">Client materials</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 16px' }}>Resources</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={tab === 'resources' ? 'btn' : 'btn-ghost'} onClick={() => setTab('resources')}>Resources</button>
        <button className={tab === 'faq' ? 'btn' : 'btn-ghost'} onClick={() => setTab('faq')}>FAQ</button>
      </div>

      {tab === 'resources' && (
        <>
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
        </>
      )}

      {tab === 'faq' && (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>{editingFaq ? 'Edit question' : 'Add a question'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
              <input placeholder="Question (e.g. What do I do on rest days?)" value={faqForm.question} onChange={e => setFaqForm({ ...faqForm, question: e.target.value })} />
              <input placeholder="Category (optional)" value={faqForm.category} onChange={e => setFaqForm({ ...faqForm, category: e.target.value })} />
            </div>
            <textarea rows="3" placeholder="Answer" value={faqForm.answer} onChange={e => setFaqForm({ ...faqForm, answer: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={saveFaq}>{editingFaq ? 'Save changes' : 'Add question'}</button>
              {editingFaq && <button className="btn-ghost" onClick={() => { setEditingFaq(null); setFaqForm({ question: '', answer: '', category: '' }) }}>Cancel</button>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faqs.map(f => (
              <div className="card" key={f.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    {f.category && <div className="muted" style={{ fontSize: 11 }}>{f.category}</div>}
                    <strong style={{ fontSize: 14 }}>{f.question}</strong>
                    <p style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{f.answer}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => editFaq(f)}>Edit</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => removeFaq(f.id)}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            {faqs.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>No questions yet — the ones you keep answering in DMs go here.</p>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Visible and searchable to all of your clients.</p>
        </>
      )}
    </div>
  )
}
