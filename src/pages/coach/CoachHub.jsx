import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { supabase } from '../../lib/supabase'

export default function CoachHub() {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploadingImg, setUploadingImg] = useState(false)
  const textareaRef = useRef(null)

  async function load() {
    const { data } = await supabase.from('client_hub').select('*').eq('id', 1).maybeSingle()
    if (data) { setTitle(data.title); setSubtitle(data.subtitle || ''); setContent(data.content_md || ''); setBannerUrl(data.banner_url || '') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function insertAtCursor(text) {
    const ta = textareaRef.current
    if (!ta) { setContent(c => c + '\n' + text); return }
    const start = ta.selectionStart, end = ta.selectionEnd
    setContent(c => c.slice(0, start) + text + c.slice(end))
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length }, 0)
  }

  function insertToggle() {
    insertAtCursor('\n<details>\n<summary>Question or heading goes here</summary>\n\nAnswer or hidden content goes here.\n\n</details>\n')
  }

  async function uploadImage(file) {
    if (!file) return
    setUploadingImg(true)
    const path = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hub-images').upload(path, file)
    if (error) { alert('Upload failed: ' + error.message); setUploadingImg(false); return }
    const { data } = supabase.storage.from('hub-images').getPublicUrl(path)
    insertAtCursor(`\n![${file.name}](${data.publicUrl})\n`)
    setUploadingImg(false)
  }

  async function save() {
    const { error } = await supabase.from('client_hub').upsert({ id: 1, title: title.trim() || 'Client Hub', subtitle: subtitle.trim(), content_md: content, banner_url: bannerUrl || null, updated_at: new Date().toISOString() })
    if (error) { alert('Could not save: ' + error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  async function uploadBanner(file) {
    if (!file) return
    setUploadingBanner(true)
    const path = `banner-${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('hub-images').upload(path, file)
    if (error) { alert('Upload failed: ' + error.message); setUploadingBanner(false); return }
    const { data } = supabase.storage.from('hub-images').getPublicUrl(path)
    setBannerUrl(data.publicUrl)
    setUploadingBanner(false)
  }

  if (loading) return <div className="muted">Loading…</div>

  return (
    <div>
      <div className="eyebrow">Client materials</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Client Hub</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
        One reference doc for the questions everyone asks in their first 30 days. Write it in Markdown — <code># heading</code>, <code>**bold**</code>, <code>1. numbered list</code>, <code>- bullet</code> — it renders styled on your clients' end.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Edit</span>
          <input placeholder="Title (used if no banner image is set)" value={title} onChange={e => setTitle(e.target.value)} />
          <input placeholder="Subtitle" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
          <div>
            <label className="btn-ghost" style={{ display: 'inline-block', cursor: 'pointer' }}>
              {uploadingBanner ? 'Uploading…' : bannerUrl ? 'Replace banner image' : '+ Upload banner image'}
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingBanner} onChange={e => uploadBanner(e.target.files[0])} />
            </label>
            {bannerUrl && <button className="btn-ghost" style={{ marginLeft: 8 }} onClick={() => setBannerUrl('')}>Remove banner</button>}
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>If set, this image replaces the text banner up top — a wide graphic (like your Workhorse logo banner) works best.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={insertToggle}>+ Collapsible section</button>
            <label className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
              {uploadingImg ? 'Uploading…' : '+ Image / banner'}
              <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg} onChange={e => uploadImage(e.target.files[0])} />
            </label>
          </div>
          <textarea ref={textareaRef} rows="20" placeholder="## Getting Started&#10;&#10;Welcome! Here's how the first week works.&#10;&#10;1. **Onboarding call** — we cover your schedule, injuries, equipment&#10;2. **Program delivery** — I walk you through your macros and program&#10;3. **You start** — don't wait for Monday, start the next training day"
            value={content} onChange={e => setContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }} />
          <p className="muted" style={{ fontSize: 11.5 }}>Tip: click in the text where you want something inserted, then hit the buttons above.</p>
          <button className="btn" onClick={save}>{saved ? 'Saved ✓' : 'Save & publish'}</button>
        </div>

        <div className="card" style={{ background: '#fff', color: '#111' }}>
          <span className="eyebrow" style={{ fontSize: 10, color: '#999' }}>Live preview</span>
          {bannerUrl ? (
            <img src={bannerUrl} alt={title} style={{ width: '100%', borderRadius: 8, marginTop: 10, display: 'block' }} />
          ) : (
            <div style={{ background: '#0A0A0A', borderRadius: 8, padding: '18px 20px', marginTop: 10, textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: '0.04em' }}>
                {title || 'Client Hub'}
              </div>
            </div>
          )}
          {subtitle && <p style={{ marginTop: 12, color: '#555', fontSize: 14 }}>{subtitle}</p>}
          <div className="hub-preview" style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: marked.parse(content || '') }} />
        </div>
      </div>

      <style>{`
        .hub-preview h1, .hub-preview h2 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.03em; color: #111; margin-top: 18px; }
        .hub-preview h2 { border-bottom: 2px solid #BF5700; padding-bottom: 4px; font-size: 20px; }
        .hub-preview h3 { font-size: 15px; margin-top: 12px; }
        .hub-preview p { margin: 8px 0; }
        .hub-preview ol, .hub-preview ul { padding-left: 20px; margin: 8px 0; }
        .hub-preview li { margin: 4px 0; }
        .hub-preview strong { color: #BF5700; }
        .hub-preview hr { border: none; border-top: 1px solid #ddd; margin: 18px 0; }
        .hub-preview code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
        .hub-preview img { max-width: 100%; border-radius: 8px; margin: 10px 0; display: block; }
        .hub-preview details { border: 1px solid #ddd; border-radius: 8px; padding: 10px 14px; margin: 10px 0; background: #fafafa; }
        .hub-preview summary { cursor: pointer; font-weight: 700; color: #111; list-style: none; }
        .hub-preview summary::-webkit-details-marker { display: none; }
        .hub-preview summary::before { content: '▸'; color: #BF5700; margin-right: 8px; display: inline-block; }
        .hub-preview details[open] summary::before { content: '▾'; }
        .hub-preview details p:first-of-type { margin-top: 10px; }
      `}</style>
    </div>
  )
}
