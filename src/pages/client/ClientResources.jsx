import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ClientResources() {
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('resources').select('*').order('created_at', { ascending: false }).then(({ data }) => setItems(data || []))
  }, [])

  async function openFile(item) {
    const { data } = await supabase.storage.from('resources').createSignedUrl(item.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const filtered = items.filter(i => (i.title + ' ' + i.category + ' ' + i.description).toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header>
        <div className="eyebrow">From your coach</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Resources</h1>
      </header>

      <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />

      {filtered.map(i => (
        <div className="card" key={i.id} onClick={() => openFile(i)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 14.5 }}>{i.title}</strong>
              {i.category && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{i.category}</div>}
              {i.description && <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>{i.description}</p>}
            </div>
            <span style={{ fontSize: 18 }}>📄</span>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <p className="muted" style={{ fontSize: 13.5 }}>Nothing here yet.</p>}
    </div>
  )
}
