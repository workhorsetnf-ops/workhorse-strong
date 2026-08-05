import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { supabase } from '../../lib/supabase'

export default function ClientFAQ() {
  const [hub, setHub] = useState(null)
  const [faqs, setFaqs] = useState([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.from('client_hub').select('*').eq('id', 1).maybeSingle().then(({ data }) => setHub(data))
    supabase.from('faq_items').select('*').order('position').then(({ data }) => setFaqs(data || []))
  }, [])

  const filtered = faqs.filter(f => (f.question + ' ' + f.answer + ' ' + f.category).toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {hub && (hub.content_md || hub.subtitle) && (
        <div className="card" style={{ background: '#fff', color: '#111' }}>
          <div style={{ background: '#0A0A0A', borderRadius: 8, padding: '18px 20px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: '0.04em' }}>{hub.title}</div>
          </div>
          {hub.subtitle && <p style={{ marginTop: 12, color: '#555', fontSize: 14 }}>{hub.subtitle}</p>}
          <div className="hub-preview" style={{ marginTop: 14, fontSize: 14, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: marked.parse(hub.content_md || '') }} />
        </div>
      )}

      <header>
        <div className="eyebrow">Quick answers</div>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>FAQ</h1>
      </header>

      <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />

      {filtered.map(f => (
        <div className="card" key={f.id} onClick={() => setOpen(open === f.id ? null : f.id)} style={{ cursor: 'pointer' }}>
          {f.category && <div className="muted" style={{ fontSize: 10.5, marginBottom: 2 }}>{f.category}</div>}
          <strong style={{ fontSize: 14 }}>{f.question}</strong>
          {open === f.id && <p style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{f.answer}</p>}
        </div>
      ))}
      {filtered.length === 0 && q && <p className="muted" style={{ fontSize: 13.5 }}>No matches.</p>}
      {faqs.length === 0 && !hub && <p className="muted" style={{ fontSize: 13.5 }}>Nothing here yet — ask your coach directly.</p>}

      <style>{`
        .hub-preview h1, .hub-preview h2 { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.03em; color: #111; margin-top: 18px; }
        .hub-preview h2 { border-bottom: 2px solid #BF5700; padding-bottom: 4px; font-size: 19px; }
        .hub-preview h3 { font-size: 14px; margin-top: 12px; }
        .hub-preview p { margin: 8px 0; }
        .hub-preview ol, .hub-preview ul { padding-left: 20px; margin: 8px 0; }
        .hub-preview li { margin: 4px 0; }
        .hub-preview strong { color: #BF5700; }
        .hub-preview hr { border: none; border-top: 1px solid #ddd; margin: 18px 0; }
        .hub-preview code { background: #f0f0f0; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
      `}</style>
    </div>
  )
}
