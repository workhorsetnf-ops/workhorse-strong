import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState([])
  const [profiles, setProfiles] = useState({})
  const [feedback, setFeedback] = useState({})
  const [photoUrls, setPhotoUrls] = useState({}) // checkinId -> signed urls

  async function load() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('checkins').select('*').order('submitted_at', { ascending: false }).limit(30),
      supabase.from('profiles').select('id, full_name'),
    ])
    setCheckins(c || [])
    setProfiles(Object.fromEntries((p || []).map(x => [x.id, x.full_name])))
  }
  useEffect(() => { load() }, [])

  async function loadPhotos(checkin) {
    if (photoUrls[checkin.id]) return
    const entries = Array.isArray(checkin.photos) && checkin.photos.length
      ? checkin.photos
      : (checkin.photo_urls || []).map(p => ({ label: '', path: p }))
    if (!entries.length) return
    const urls = []
    for (const en of entries) {
      const { data } = await supabase.storage.from('checkin-photos').createSignedUrl(en.path, 3600)
      if (data?.signedUrl) urls.push({ label: en.label, url: data.signedUrl })
    }
    setPhotoUrls(prev => ({ ...prev, [checkin.id]: urls }))
  }

  async function sendFeedback(id) {
    if (!feedback[id]?.trim()) return
    await supabase.from('checkins').update({ coach_feedback: feedback[id].trim() }).eq('id', id)
    setFeedback(f => ({ ...f, [id]: '' }))
    load()
  }

  return (
    <div>
      <div className="eyebrow">Review</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Check-ins</h1>

      {checkins.length === 0 && <div className="card muted">No check-ins submitted yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {checkins.map(c => (
          <div className="card" key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{profiles[c.client_id] || 'Client'}</strong>
                <span className="muted" style={{ fontSize: 13, marginLeft: 10 }}>{new Date(c.submitted_at).toLocaleDateString()}</span>
              </div>
              {!c.coach_feedback && <span style={{ color: 'var(--orange-hot)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Needs review</span>}
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 8 }}>
              {c.weight && <>Weight <strong style={{ color: 'var(--white)' }}>{c.weight}</strong> · </>}
              {c.waist && <>Waist <strong style={{ color: 'var(--white)' }}>{c.waist}</strong> · </>}
              {c.sleep_avg && <>Sleep <strong style={{ color: 'var(--white)' }}>{c.sleep_avg}h</strong> · </>}
              Energy <strong style={{ color: 'var(--white)' }}>{c.energy}/10</strong> · Hunger <strong style={{ color: 'var(--white)' }}>{c.hunger}/10</strong>
            </div>
            {c.notes && <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>{c.notes}</p>}

            {Array.isArray(c.form_responses) && c.form_responses.length > 0 && (
              <div style={{ marginTop: 10, background: 'var(--steel)', borderRadius: 8, padding: '10px 12px' }}>
                {c.form_name && <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{c.form_name}</div>}
                {c.form_responses.map((r, i) => (
                  <div key={i} style={{ fontSize: 13.5, marginBottom: 5 }}>
                    <span className="muted">{r.label}</span>
                    <div style={{ fontWeight: 600, marginTop: 1 }}>{String(r.value)}</div>
                  </div>
                ))}
              </div>
            )}

            {((c.photos?.length || 0) > 0 || (c.photo_urls?.length || 0) > 0) && (
              <div style={{ marginTop: 10 }}>
                {!photoUrls[c.id]
                  ? <button className="btn-ghost" onClick={() => loadPhotos(c)}>View {(c.photos?.length || c.photo_urls?.length)} photo(s)</button>
                  : <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {photoUrls[c.id].map((ph, i) => (
                        <figure key={i} style={{ margin: 0 }}>
                          <img src={ph.url} alt={ph.label || 'progress'} style={{ height: 170, borderRadius: 8, display: 'block' }} />
                          {ph.label && <figcaption className="eyebrow" style={{ fontSize: 9, textAlign: 'center', marginTop: 4 }}>{ph.label}</figcaption>}
                        </figure>
                      ))}
                    </div>}
              </div>
            )}

            {c.coach_feedback
              ? <div style={{ marginTop: 10, borderLeft: '3px solid var(--green)', paddingLeft: 10, fontSize: 13.5 }} className="muted">Feedback sent: {c.coach_feedback}</div>
              : <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input placeholder="Write feedback…" value={feedback[c.id] || ''} onChange={e => setFeedback(f => ({ ...f, [c.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && sendFeedback(c.id)} />
                  <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={() => sendFeedback(c.id)}>Send</button>
                </div>}
          </div>
        ))}
      </div>
    </div>
  )
}
