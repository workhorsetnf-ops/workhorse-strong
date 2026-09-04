import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const EMPTY_LOG = { client_id: '', weight: '', waist: '', sleep_avg: '', energy: 7, hunger: 5, notes: '' }
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const EMPTY_SNAPSHOT = {
  status: 'pending', current_macros: '', training_program: '', cardio: '',
  coach_notes: '', training_notes: '', nutrition_notes: '', other_notes: '',
}

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

function fmtDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function Chip({ children }) {
  return <span className="muted" style={{ fontSize: 11.5, background: 'var(--steel)', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{children}</span>
}

function StatusBadge({ status }) {
  const done = status === 'done'
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em',
      padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap',
      background: done ? 'rgba(76,175,109,0.15)' : 'rgba(255,90,0,0.15)',
      color: done ? 'var(--green)' : 'var(--orange-hot)',
    }}>{done ? 'Done' : 'Pending'}</span>
  )
}

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState([])
  const [clients, setClients] = useState([])
  const [feedback, setFeedback] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [compareFor, setCompareFor] = useState(null)   // checkin id being compared
  const [compareWith, setCompareWith] = useState({})   // checkin id -> earlier checkin id
  const [priorByClient, setPriorByClient] = useState({}) // client id -> earlier checkins with photos
  const [compareBusy, setCompareBusy] = useState(false)
  const [logging, setLogging] = useState(false)
  const [logForm, setLogForm] = useState(EMPTY_LOG)
  const [snapshot, setSnapshot] = useState({})   // checkin id -> editable snapshot/notes fields
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(true)

  async function load() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('checkins').select('*').order('submitted_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('id, full_name, phase, checkin_day, status, payment_plan, contract_ends, split_ends')
        .eq('role', 'client').order('full_name'),
    ])
    setCheckins(c || [])
    setClients(p || [])
    // Seed local edit state for any check-in we haven't already got a draft for —
    // this only fills in missing entries, so an in-progress edit on another card
    // (or this one) survives the reload a save triggers.
    setSnapshot(prev => {
      const next = { ...prev }
      for (const row of c || []) {
        if (next[row.id]) continue
        next[row.id] = {
          status: row.status || 'pending',
          current_macros: row.current_macros || '',
          training_program: row.training_program || '',
          cardio: row.cardio || '',
          coach_notes: row.coach_notes || '',
          training_notes: row.training_notes || '',
          nutrition_notes: row.nutrition_notes || '',
          other_notes: row.other_notes || '',
        }
      }
      return next
    })
  }
  useEffect(() => { load() }, [])

  function toggleExpand(clientId) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId)
      return next
    })
  }

  function updateSnap(checkinId, field, value) {
    setSnapshot(s => ({ ...s, [checkinId]: { ...(s[checkinId] || EMPTY_SNAPSHOT), [field]: value } }))
  }

  async function saveSnapshot(checkinId) {
    const snap = snapshot[checkinId] || EMPTY_SNAPSHOT
    setSavingId(checkinId)
    const { error } = await supabase.from('checkins').update({
      status: snap.status,
      current_macros: snap.current_macros?.trim() || null,
      training_program: snap.training_program?.trim() || null,
      cardio: snap.cardio?.trim() || null,
      coach_notes: snap.coach_notes || '',
      training_notes: snap.training_notes || '',
      nutrition_notes: snap.nutrition_notes || '',
      other_notes: snap.other_notes || '',
    }).eq('id', checkinId)
    setSavingId(null)
    if (error) { alert('Could not save: ' + error.message); return }
    setSavedId(checkinId); setTimeout(() => setSavedId(null), 2000)
    load()
  }

  // Grouped by client so a coach reviews one person's whole picture at once,
  // instead of scrolling a mixed feed of everyone's most recent submissions.
  const groups = useMemo(() => {
    const map = {}
    for (const cl of clients) map[cl.id] = { profile: cl, checkins: [] }
    for (const row of checkins) {
      if (!map[row.client_id]) map[row.client_id] = { profile: { id: row.client_id, full_name: 'Client' }, checkins: [] }
      map[row.client_id].checkins.push(row)
    }
    for (const g of Object.values(map)) g.checkins.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    return Object.values(map).sort((a, b) => {
      const aLatest = a.checkins[0], bLatest = b.checkins[0]
      const aNeeds = aLatest ? (!aLatest.coach_feedback || (aLatest.status || 'pending') !== 'done') : false
      const bNeeds = bLatest ? (!bLatest.coach_feedback || (bLatest.status || 'pending') !== 'done') : false
      if (aNeeds !== bNeeds) return aNeeds ? -1 : 1
      if (!aLatest && !bLatest) return (a.profile.full_name || '').localeCompare(b.profile.full_name || '')
      if (!aLatest) return 1
      if (!bLatest) return -1
      return new Date(bLatest.submitted_at) - new Date(aLatest.submitted_at)
    })
  }, [clients, checkins])

  const filteredGroups = groups
    .filter(g => (g.profile.full_name || '').toLowerCase().includes(search.toLowerCase()))
    .filter(g => {
      if (!onlyNeedsReview) return true
      const latest = g.checkins[0]
      return latest && (!latest.coach_feedback || (latest.status || 'pending') !== 'done')
    })

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
  // The card list is capped at 200 across every client, so a long-tenured
  // client's first check-in may not be in it. Fetch that client's own history
  // on demand instead of comparing against whatever happened to be loaded.
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, marginBottom: 16 }}>
        <input placeholder="Search clients…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <button className={onlyNeedsReview ? 'btn' : 'btn-ghost'} style={{ padding: '9px 16px', fontSize: 13 }}
          onClick={() => setOnlyNeedsReview(v => !v)}>
          {onlyNeedsReview ? 'Needs review' : 'All clients'}
        </button>
      </div>

      {clients.length === 0 && <div className="card muted">No clients yet.</div>}
      {clients.length > 0 && filteredGroups.length === 0 && (
        <div className="card muted">{onlyNeedsReview ? 'Nothing needs review right now.' : 'No matches.'}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredGroups.map(g => {
          const latest = g.checkins[0]
          const isOpen = expanded.has(g.profile.id)
          return (
            <div className="card" key={g.profile.id}>
              <div onClick={() => toggleExpand(g.profile.id)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>
                    <span className="muted" style={{ display: 'inline-block', width: 14 }}>{isOpen ? '▾' : '▸'}</span>
                    {g.profile.full_name || 'Client'}
                  </strong>
                  {latest && <span className="muted" style={{ fontSize: 12.5, marginLeft: 8 }}>Last check-in {new Date(latest.submitted_at).toLocaleDateString()}</span>}
                  {!latest && <span className="muted" style={{ fontSize: 12.5, marginLeft: 8 }}>No check-ins yet</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {g.profile.checkin_day != null && g.profile.checkin_day !== undefined && <Chip>{WEEKDAYS[g.profile.checkin_day]}</Chip>}
                  {g.profile.phase && <Chip><span style={{ textTransform: 'capitalize' }}>{g.profile.phase}</span></Chip>}
                  {latest && <StatusBadge status={latest.status || 'pending'} />}
                  {latest && !latest.coach_feedback && (
                    <span style={{ color: 'var(--orange-hot)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Needs reply</span>
                  )}
                </div>
              </div>

              {(g.profile.payment_plan || g.profile.contract_ends || g.profile.split_ends) && (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {g.profile.payment_plan && <>{g.profile.payment_plan}</>}
                  {g.profile.contract_ends && <> · Contract ends {fmtDate(g.profile.contract_ends)}</>}
                  {g.profile.split_ends && <> · Split ends {fmtDate(g.profile.split_ends)}</>}
                </div>
              )}

              {isOpen && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {g.checkins.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing submitted yet — you can log one for them above.</p>}
                  {g.checkins.map(c => {
                    const snap = snapshot[c.id] || EMPTY_SNAPSHOT
                    return (
                      <div key={c.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          <span className="muted" style={{ fontSize: 13 }}>{new Date(c.submitted_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
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
                                      No earlier check-in with photos for {g.profile.full_name || 'this client'} — this is the first one.
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

                        <div style={{ marginTop: 10, background: 'var(--steel)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <span className="eyebrow" style={{ fontSize: 10 }}>Coach snapshot</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {['pending', 'done'].map(s => (
                                <button key={s} className={snap.status === s ? 'btn' : 'btn-ghost'} style={{ padding: '4px 10px', fontSize: 11 }}
                                  onClick={() => updateSnap(c.id, 'status', s)}>{s === 'done' ? 'Done' : 'Pending'}</button>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <input placeholder="Current macros" value={snap.current_macros} onChange={e => updateSnap(c.id, 'current_macros', e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }} />
                            <input placeholder="Training program" value={snap.training_program} onChange={e => updateSnap(c.id, 'training_program', e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }} />
                            <input placeholder="Cardio" value={snap.cardio} onChange={e => updateSnap(c.id, 'cardio', e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }} />
                          </div>
                          <div>
                            <label className="muted" style={{ fontSize: 11 }}>Notes</label>
                            <textarea rows="2" placeholder="General notes" value={snap.coach_notes} onChange={e => updateSnap(c.id, 'coach_notes', e.target.value)} />
                          </div>
                          <div>
                            <label className="muted" style={{ fontSize: 11 }}>Training notes</label>
                            <textarea rows="2" placeholder="What changed in the program" value={snap.training_notes} onChange={e => updateSnap(c.id, 'training_notes', e.target.value)} />
                          </div>
                          <div>
                            <label className="muted" style={{ fontSize: 11 }}>Nutrition notes</label>
                            <textarea rows="2" placeholder="What changed with macros/food" value={snap.nutrition_notes} onChange={e => updateSnap(c.id, 'nutrition_notes', e.target.value)} />
                          </div>
                          <div>
                            <label className="muted" style={{ fontSize: 11 }}>Other notes</label>
                            <textarea rows="2" placeholder="Anything else worth remembering" value={snap.other_notes} onChange={e => updateSnap(c.id, 'other_notes', e.target.value)} />
                          </div>
                          <div>
                            <button className="btn" style={{ padding: '8px 16px', fontSize: 12 }} onClick={() => saveSnapshot(c.id)} disabled={savingId === c.id}>
                              {savingId === c.id ? 'Saving…' : savedId === c.id ? 'Saved ✓' : 'Save'}
                            </button>
                          </div>
                        </div>

                        {c.coach_feedback
                          ? <div style={{ marginTop: 10, borderLeft: '3px solid var(--green)', paddingLeft: 10, fontSize: 13.5 }} className="muted">Feedback sent: {c.coach_feedback}</div>
                          : <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                              <input placeholder="Write feedback…" value={feedback[c.id] || ''} onChange={e => setFeedback(f => ({ ...f, [c.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && sendFeedback(c.id)} />
                              <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={() => sendFeedback(c.id)}>Send</button>
                            </div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
