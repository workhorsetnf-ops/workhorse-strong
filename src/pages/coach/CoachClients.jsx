import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CoachClients() {
  const [clients, setClients] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [maxes, setMaxes] = useState([])          // [{id?, lift_name, max_weight}]
  const [savedId, setSavedId] = useState(null)
  const [photosFor, setPhotosFor] = useState(null)     // client id with timeline open
  const [timeline, setTimeline] = useState({})         // clientId -> rows

  async function load() {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name')
    setClients(data || [])
  }
  useEffect(() => { load() }, [])

  async function startEdit(c) {
    setEditing(c.id)
    setForm({ full_name: c.full_name, phase: c.phase, protein_g: c.protein_g, carbs_g: c.carbs_g, fat_g: c.fat_g, calories: c.calories })
    const { data } = await supabase.from('client_maxes').select('*').eq('client_id', c.id).order('lift_name')
    setMaxes(data || [])
  }

  function setMax(i, field, value) {
    setMaxes(m => m.map((x, j) => j === i ? { ...x, [field]: value } : x))
  }

  async function save(id) {
    await supabase.from('profiles').update({
      full_name: form.full_name, phase: form.phase,
      protein_g: +form.protein_g || 0, carbs_g: +form.carbs_g || 0,
      fat_g: +form.fat_g || 0, calories: +form.calories || 0
    }).eq('id', id)
    for (const m of maxes) {
      if (!m.lift_name?.trim()) continue
      await supabase.from('client_maxes').upsert({
        client_id: id, lift_name: m.lift_name.trim(), max_weight: +m.max_weight || 0
      }, { onConflict: 'client_id,lift_name' })
    }
    setEditing(null); setSavedId(id); setTimeout(() => setSavedId(null), 2000)
    load()
  }

  async function togglePhotos(clientId) {
    if (photosFor === clientId) { setPhotosFor(null); return }
    setPhotosFor(clientId)
    if (timeline[clientId]) return
    const { data: checkins } = await supabase.from('checkins')
      .select('id, submitted_at, weight, photos, photo_urls')
      .eq('client_id', clientId).order('submitted_at', { ascending: false }).limit(30)
    const rows = []
    for (const c of checkins || []) {
      const entries = Array.isArray(c.photos) && c.photos.length
        ? c.photos
        : (c.photo_urls || []).map(pth => ({ label: '', path: pth }))
      if (!entries.length) continue
      const row = { date: c.submitted_at, weight: c.weight, Front: null, Side: null, Back: null, others: [] }
      for (const en of entries) {
        const { data } = await supabase.storage.from('checkin-photos').createSignedUrl(en.path, 3600)
        if (!data?.signedUrl) continue
        if (row[en.label] !== undefined && en.label) row[en.label] = data.signedUrl
        else row.others.push(data.signedUrl)
      }
      rows.push(row)
    }
    setTimeline(t => ({ ...t, [clientId]: rows }))
  }

  async function removeMax(i) {
    const m = maxes[i]
    if (m.id) await supabase.from('client_maxes').delete().eq('id', m.id)
    setMaxes(list => list.filter((_, j) => j !== i))
  }

  return (
    <div>
      <div className="eyebrow">Roster</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Clients</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 22 }}>
        To add a client: Supabase → Authentication → Users → Add user. They appear here after first sign-in.
      </p>

      {clients.length === 0 && <div className="card muted">No clients yet.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {clients.map(c => (
          <div className="card" key={c.id}>
            {editing === c.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                  <input value={form.full_name} placeholder="Name" onChange={e => setForm({ ...form, full_name: e.target.value })} />
                  <select value={form.phase} onChange={e => setForm({ ...form, phase: e.target.value })}>
                    <option value="cut">Cut</option><option value="build">Build</option>
                    <option value="recomp">Recomp</option><option value="maintain">Maintain</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  <input inputMode="numeric" value={form.protein_g} placeholder="Protein g" onChange={e => setForm({ ...form, protein_g: e.target.value })} />
                  <input inputMode="numeric" value={form.carbs_g} placeholder="Carbs g" onChange={e => setForm({ ...form, carbs_g: e.target.value })} />
                  <input inputMode="numeric" value={form.fat_g} placeholder="Fat g" onChange={e => setForm({ ...form, fat_g: e.target.value })} />
                  <input inputMode="numeric" value={form.calories} placeholder="Calories" onChange={e => setForm({ ...form, calories: e.target.value })} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="eyebrow" style={{ fontSize: 10 }}>Training maxes (for % work)</span>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={() => setMaxes([...maxes, { lift_name: '', max_weight: '' }])}>+ Add lift</button>
                  </div>
                  {maxes.map((m, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginBottom: 6 }}>
                      <input placeholder="Lift (e.g. Squat)" value={m.lift_name} onChange={e => setMax(i, 'lift_name', e.target.value)} />
                      <input inputMode="decimal" placeholder="Max (lbs)" value={m.max_weight} onChange={e => setMax(i, 'max_weight', e.target.value)} />
                      <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => removeMax(i)}>✕</button>
                    </div>
                  ))}
                  {maxes.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No maxes on file. Lift names must match the "Based on lift" field in programs.</p>}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={() => save(c.id)}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{c.full_name || '(no name yet)'}</strong>
                  <div className="muted" style={{ fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
                    {c.phase} · P {c.protein_g} / C {c.carbs_g} / F {c.fat_g} · {c.calories} kcal
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-ghost" onClick={() => togglePhotos(c.id)}>
                    {photosFor === c.id ? 'Hide photos' : 'Photos'}
                  </button>
                  <button className="btn-ghost" onClick={() => startEdit(c)}>
                    {savedId === c.id ? 'Saved ✓' : 'Edit'}
                  </button>
                </div>
              </div>
            )}

            {photosFor === c.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                {!timeline[c.id] && <p className="muted" style={{ fontSize: 13 }}>Loading photos…</p>}
                {timeline[c.id]?.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No progress photos yet.</p>}
                {timeline[c.id]?.length > 0 && (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(3, minmax(130px, 1fr))', gap: 8, minWidth: 560 }}>
                      <div className="eyebrow" style={{ fontSize: 10, alignSelf: 'end' }}>Check-in</div>
                      {['Front', 'Side', 'Back'].map(l => <div key={l} className="eyebrow" style={{ fontSize: 10, alignSelf: 'end' }}>{l}</div>)}
                      {timeline[c.id].map((row, i) => (
                        <FragmentRow key={i} row={row} />
                      ))}
                    </div>
                  </div>
                )}
                {timeline[c.id]?.some(r => r.others.length > 0) && (
                  <div style={{ marginTop: 10 }}>
                    <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Unlabeled (older check-ins)</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {timeline[c.id].flatMap(r => r.others).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="progress" style={{ height: 110, borderRadius: 6 }} /></a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}


function FragmentRow({ row }) {
  const d = new Date(row.date)
  return (
    <>
      <div style={{ fontSize: 12.5, alignSelf: 'start', paddingTop: 4 }}>
        <strong>{d.toLocaleDateString()}</strong>
        {row.weight && <div className="muted" style={{ fontSize: 11.5 }}>{row.weight} lbs</div>}
      </div>
      {['Front', 'Side', 'Back'].map(l => (
        <div key={l}>
          {row[l]
            ? <a href={row[l]} target="_blank" rel="noreferrer"><img src={row[l]} alt={l} style={{ width: '100%', borderRadius: 6, display: 'block' }} /></a>
            : <div style={{ background: 'var(--steel)', borderRadius: 6, height: 60, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 11 }}>—</div>}
        </div>
      ))}
    </>
  )
}
