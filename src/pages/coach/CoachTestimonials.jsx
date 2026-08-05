import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CoachTestimonials() {
  const [items, setItems] = useState([])
  const [names, setNames] = useState({})
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('testimonials').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('role', 'client'),
    ]).then(([{ data: t }, { data: c }]) => {
      setItems(t || [])
      setNames(Object.fromEntries((c || []).map(x => [x.id, x.full_name])))
    })
  }, [])

  function copy(item) {
    const text = `"${item.body}" — ${names[item.client_id] || 'Client'}`
    navigator.clipboard?.writeText(text)
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div>
      <div className="eyebrow">Marketing gold</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Testimonials</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 22 }}>Collected automatically when clients hit a milestone and choose to share.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(t => (
          <div className="card" key={t.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <p style={{ fontSize: 15, lineHeight: 1.5, fontStyle: 'italic' }}>&ldquo;{t.body}&rdquo;</p>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <strong>{names[t.client_id] || 'Client'}</strong>
                  {t.milestone_label && <span className="muted"> — {t.milestone_label}</span>}
                  <span className="muted"> · {new Date(t.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12, flexShrink: 0 }} onClick={() => copy(t)}>
                {copiedId === t.id ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="card muted">None yet — these show up automatically once a client shares one.</div>}
      </div>
    </div>
  )
}
