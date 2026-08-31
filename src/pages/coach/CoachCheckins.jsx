import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const EMPTY_LOG = { client_id: '', weight: '', waist: '', sleep_avg: '', energy: 7, hunger: 5, notes: '' }

// Front/Side/Back first, anything else after, so a comparison always reads in
// the same order rather than however the rows happened to come back.
const POSE_ORDER = ['front', 'side', 'back']
function poseRank(label) {
  const i = POSE_ORDER.indexOf(String(label || '').trim().toLowerCase())
  return i === -1 ? POSE_ORDER.length : i
}

// Match this week's photos against an earlier week's, pose to pose.
// Older check-ins predate the label field and stored a bare path list, so when
// either side is unlabelled fall back to pairing by position — better than
// showing a front shot next to a back shot and calling it progress.
export function pairPhotos(now = [], then = []) {
  const labelled = now.length > 0 && then.length > 0
    && now.every(p => p.label) && then.every(p => p.label)
  if (!labelled) {
    const n = Math.max(now.length, then.length)
    return Array.from({ length: n }, (_, i) => ({
      label: now[i]?.label || then[i]?.label || `Photo ${i + 1}`,
      now: now[i] || null, then: then[i] || null, matched: false,
    }))
  }
  const labels = [...new Set([...now.map(p => p.label), ...then.map(p => p.label)])]
    .sort((a, b) => poseRank(a) - poseRank(b) || String(a).localeCompare(String(b)))
  return labels.map(l => ({
    label: l,
    now: now.find(p => p.label === l) || null,
    then: then.find(p => p.label === l) || null,
    matched: true,
  }))
}

export function countPhotos(c) {
  return (Array.isArray(c?.photos) ? c.photos.length : 0) || (Array.isArray(c?.photo_urls) ? c.photo_urls.length : 0)
}

// Weight change between two check-ins, or null when either is missing it.
export function weightDelta(now, then) {
  const a = Number(now?.weight), b = Number(then?.weight)
  if (!a || !b) return null
  const diff = Math.round((a - b) * 10) / 10
  return { from: b, to: a, diff, text: `${b} → ${a} lbs (${diff > 0 ? '+' : ''}${diff})` }
}

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState([])
  const [profiles, setProfiles] = useState({})
  const [clients, setClients] = useState([])
  const [feedback, setFeedback] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [compareFor, setCompareFor] = useState(null)   // checkin id being compared
  const [compareWith, setCompareWith] = useState({})   // checkin id -> earlier checkin id
  const [priorByClient, setPriorByClient] = useState({}) // client id -> earlier checkins with photos
  const [compareBusy, setCompareBusy] = useState(false)
  const [logging, setLogging] = useState(false)
  const [logForm, setLogForm] = useState(EMPTY_LOG)

  async function load() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('checkins').select('*').order('submitted_at', { ascending: false }).limit(30),
      supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name'),
    ])
    setCheckins(c || [])
    setProfiles(Object.fromEntries((p || []).map(x => [x.id, x.full_name])))
    setClients(p || [])
  }
  useEffect(() => { load() }, [])

  async function submitLoggedCheckin() {
    if (!logForm.client_id) { alert('Pick a client first.'); return }
    const { error } = await supabase.from('checkins').insert({
      client_id: logForm.client_id,
      weight: +logForm.weight || null, waist: +logForm.waist || null, sleep_avg: +logForm.sleep_avg || null,
      energy: +logForm.energy, hunger: +logForm.hunger, notes: logForm.notes,
    })
    if (error) { alert('Could not save: ' + error.message); return }
    setLogForm(EMPTY_LOG); setLogging(false)
    load()
  }

  async function loadPhotos(checkin) {
    if (photoUrls[checkin.id]) return photoUrls[checkin.id]
    const entries = Array.isArray(checkin.photos) && checkin.photos.length
      ? checkin.photos
      : (checkin.photo_urls || []).map(p => ({ label: '', path: p }))
    if (!entries.length) return []
    const urls = []
    for (const en of entries) {
      const { data } = await supabase.storage.from('checkin-photos').createSignedUrl(en.path, 3600)
      if (data?.signedUrl) urls.push({ label: en.label, url: data.signedUrl })
    }
    setPhotoUrls(prev => ({ ...prev, [checkin.id]: urls }))
    return urls
  }

  // ---- compare against an earlier week ----
  // The card list is capped at 30 across every client, so their first check-in
  // is usually not in it. Fetch that client's own history on demand instead of
  // comparing against whatever happened to be loaded.
  async function openCompare(c) {
    if (compareFor === c.id) { setCompareFor(null); return }
    setCompareBusy(true)
    setCompareFor(c.id)
    await loadPhotos(c)
    if (!priorByClient[c.client_id]) {
      const { data } = await supabase.from('checkins').select('*')
        .eq('client_id', c.client_id).order('submitted_at', { ascending: false }).limit(60)
      const withPhotos = (data || []).filter(x => countPhotos(x) > 0)
      setPriorByClient(prev => ({ ...prev, [c.client_id]: withPhotos }))
      const earlier = withPhotos.filter(x => new Date(x.submitted_at) < new Date(c.submitted_at))
      // default to the most recent earlier check-in — week-on-week is the
      // comparison you want most often; the whole-journey one is a click away
      const pick = earlier[0]
      if (pick) { setCompareWith(w => ({ ...w, [c.id]: pick.id })); await loadPhotos(pick) }
    }
    setCompareBusy(false)
  }

  async function chooseComparison(currentId, earlier) {
    setCompareWith(w => ({ ...w, [currentId]: earlier.id }))
    await loadPhotos(earlier)
  }

  async function sendFeedback(id) {
    if (!feedback[id]?.trim()) return
    await supabase.from('checkins').update({ coach_feedback: feedback[id].trim() }).eq('id', id)
    setFeedback(f => ({ ...f, [id]: '' }))
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Review</div>
          <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Check-ins</h1>
        </div>
        <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setLogging(l => !l)}>
          {logging ? <X size={15} /> : <Plus size={15} />} {logging ? 'Cancel' : 'Log check-in for a client'}
        </button>
      </div>

      {logging && (
        <div className="card" style={{ marginTop: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Fill this out on their behalf — during a call, weigh-in, whatever</span>
          <select value={logForm.client_id} onChange={e => setLogForm({ ...logForm, client_id: e.target.value })}>
            <option value="">Select client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0,8)}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <input inputMode="decimal" placeholder="Weight" value={logForm.weight} onChange={e => setLogForm({ ...logForm, weight: e.target.value })} />
            <input inputMode="decimal" placeholder="Waist" value={logForm.waist} onChange={e => setLogForm({ ...logForm, waist: e.target.value })} />
            <input inputMode="decimal" placeholder="Sleep hrs" value={logForm.sleep_avg} onChange={e => setLogForm({ ...logForm, sleep_avg: e.target.value })} />
          </div>
          {[['Energy', 'energy'], ['Hunger', 'hunger']].map(([label, key]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <span>{label}</span><span style={{ color: 'var(--orange-hot)' }}>{logForm[key]}/10</span>
              </div>
              <input type="range" min="1" max="10" value={logForm[key]} onChange={e => setLogForm({ ...logForm, [key]: e.target.value })} style={{ accentColor: 'var(--orange)', padding: 0 }} />
            </div>
          ))}
          <textarea rows="2" placeholder="Notes from the conversation" value={logForm.notes} onChange={e => setLogForm({ ...logForm, notes: e.target.value })} />
          <button className="btn" onClick={submitLoggedCheckin}>Save check-in</button>
        </div>
      )}

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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: photoUrls[c.id] ? 8 : 0 }}>
                  {!photoUrls[c.id] && (
                    <button className="btn-ghost" onClick={() => loadPhotos(c)}>View {countPhotos(c)} photo(s)</button>
                  )}
                  <button className="btn-ghost" onClick={() => openCompare(c)}>
                    {compareFor === c.id ? 'Close compare' : '⇄ Compare to earlier'}
                  </button>
                </div>

                {photoUrls[c.id] && compareFor !== c.id && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {photoUrls[c.id].map((ph, i) => (
                      <figure key={i} style={{ margin: 0 }}>
                        <img src={ph.url} alt={ph.label || 'progress'} style={{ height: 170, borderRadius: 8, display: 'block' }} />
                        {ph.label && <figcaption className="eyebrow" style={{ fontSize: 9, textAlign: 'center', marginTop: 4 }}>{ph.label}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}

                {compareFor === c.id && (() => {
                  const prior = (priorByClient[c.client_id] || [])
                    .filter(x => new Date(x.submitted_at) < new Date(c.submitted_at))
                  const chosenId = compareWith[c.id]
                  const chosen = prior.find(x => x.id === chosenId) || null
                  const pairs = chosen ? pairPhotos(photoUrls[c.id] || [], photoUrls[chosen.id] || []) : []
                  const delta = chosen ? weightDelta(c, chosen) : null
                  return (
                    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                      {compareBusy && <p className="muted" style={{ fontSize: 12 }}>Loading…</p>}
                      {!compareBusy && prior.length === 0 && (
                        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                          No earlier check-in with photos for {profiles[c.client_id] || 'this client'} — this is the first one.
                        </p>
                      )}
                      {prior.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                          <span className="eyebrow" style={{ fontSize: 9.5 }}>Compare to</span>
                          {/* the very first check-in is the comparison that
                              actually sells the transformation, so it gets its
                              own button rather than being buried in the list */}
                          <button className={chosenId === prior[prior.length - 1].id ? 'btn' : 'btn-ghost'}
                            style={{ padding: '4px 9px', fontSize: 11.5 }}
                            onClick={() => chooseComparison(c.id, prior[prior.length - 1])}>
                            First ever
                          </button>
                          {prior.slice(0, 6).map(p => (
                            <button key={p.id} className={chosenId === p.id ? 'btn' : 'btn-ghost'}
                              style={{ padding: '4px 9px', fontSize: 11.5 }}
                              onClick={() => chooseComparison(c.id, p)}>
                              {new Date(p.submitted_at).toLocaleDateString()}
                            </button>
                          ))}
                        </div>
                      )}
                      {chosen && (
                        <>
                          <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                            {new Date(chosen.submitted_at).toLocaleDateString()} → {new Date(c.submitted_at).toLocaleDateString()}
                            {delta && <span style={{ color: 'var(--orange-hot)', marginLeft: 8, fontWeight: 700 }}>{delta.text}</span>}
                          </div>
                          {pairs.length > 0 && !pairs[0].matched && (
                            <p className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                              One of these check-ins has untagged photos, so these are lined up in order rather than by pose.
                            </p>
                          )}
                          {pairs.map((pr, i) => (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 3 }}>{pr.label}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {[pr.then, pr.now].map((ph, j) => (
                                  <div key={j}>
                                    {ph
                                      ? <img src={ph.url} alt={pr.label} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
                                      : <div className="muted" style={{ fontSize: 11, padding: '20px 6px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 8 }}>
                                          no {pr.label.toLowerCase()} shot
                                        </div>}
                                    <div className="muted" style={{ fontSize: 10, textAlign: 'center', marginTop: 3 }}>
                                      {j === 0 ? new Date(chosen.submitted_at).toLocaleDateString() : 'Now'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })()}
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
