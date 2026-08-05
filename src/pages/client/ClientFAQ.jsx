import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ClientFAQ() {
  const [faqs, setFaqs] = useState([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.from('faq_items').select('*').order('position').then(({ data }) => setFaqs(data || []))
  }, [])

  const filtered = faqs.filter(f => (f.question + ' ' + f.answer + ' ' + f.category).toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header>
        <div className="eyebrow">Quick answers</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>FAQ</h1>
      </header>

      <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />

      {filtered.map(f => (
        <div className="card" key={f.id} onClick={() => setOpen(open === f.id ? null : f.id)} style={{ cursor: 'pointer' }}>
          {f.category && <div className="muted" style={{ fontSize: 10.5, marginBottom: 2 }}>{f.category}</div>}
          <strong style={{ fontSize: 14 }}>{f.question}</strong>
          {open === f.id && <p style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>{f.answer}</p>}
        </div>
      ))}
      {filtered.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Nothing here yet — ask your coach directly.</p>}
    </div>
  )
}
