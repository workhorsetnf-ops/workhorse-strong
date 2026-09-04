import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function ClientDocuments() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase.from('client_documents').select('*').eq('client_id', profile.id).order('uploaded_at', { ascending: false })
      .then(({ data }) => { setItems(data || []); setLoaded(true) })
  }, [profile])

  async function openFile(item) {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(item.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div>
      <div className="eyebrow">From your coach</div>
      <h1 style={{ fontSize: 24, margin: '6px 0 16px' }}>Documents</h1>

      {loaded && items.length === 0 && <div className="card muted">Nothing here yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(i => (
          <div className="card" key={i.id} onClick={() => openFile(i)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{i.title}</strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{i.category} · {new Date(i.uploaded_at).toLocaleDateString()}</div>
              </div>
              <span style={{ fontSize: 20 }}>📄</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
