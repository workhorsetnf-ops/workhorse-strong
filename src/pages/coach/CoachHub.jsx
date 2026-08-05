import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { supabase } from '../../lib/supabase'

export default function CoachHub() {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('client_hub').select('*').eq('id', 1).maybeSingle()
    if (data) { setTitle(data.title); setSubtitle(data.subtitle || ''); setContent(data.content_md || '') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function save() {
    await supabase.from('client_hub').upsert({ id: 1, title: title.trim() || 'Client Hub', subtitle: subtitle.trim(), content_md: content, updated_at: new Date().toISOString() })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
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
          <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <input placeholder="Subtitle" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
          <textarea rows="22" placeholder="## Getting Started&#10;&#10;Welcome! Here's how the first week works.&#10;&#10;1. **Onboarding call** — we cover your schedule, injuries, equipment&#10;2. **Program delivery** — I walk you through your macros and program&#10;3. **You start** — don't wait for Monday, start the next training day"
            value={content} onChange={e => setContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }} />
          <button className="btn" onClick={save}>{saved ? 'Saved ✓' : 'Save & publish'}</button>
        </div>

        <div className="card" style={{ background: '#fff', color: '#111' }}>
          <span className="eyebrow" style={{ fontSize: 10, color: '#999' }}>Live preview</span>
          <div style={{ background: '#0A0A0A', borderRadius: 8, padding: '18px 20px', marginTop: 10, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: '0.04em' }}>
              {title || 'Client Hub'}
            </div>
          </div>
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
      `}</style>
    </div>
  )
}
