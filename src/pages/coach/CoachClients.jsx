import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// Workhorse starting-macros methodology: Mifflin-St Jeor + wrestler multipliers
function calcMacros({ weightLbs, age, sex, hft, hin, bf, activity, goal }) {
  const kg = weightLbs / 2.2046
  const cm = (hft * 12 + hin) * 2.54
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
  const mult = { 'lifting-only': 1.45, 'light-schedule': 1.55, 'working-talent': 1.65, 'heavy-schedule': 1.8 }[activity]
  const tdee = Math.round((bmr * mult) / 25) * 25
  let target = goal === 'cut' ? tdee - 500 : goal === 'build' ? tdee + 300 : tdee
  const notes = []
  if (goal === 'cut') {
    const floor = 10 * weightLbs
    if (target < floor) { target = Math.round(floor / 25) * 25; notes.push('Calories floored at 10× bodyweight — the straight −500 cut too deep.') }
  }
  let proteinBase = weightLbs
  if (weightLbs >= 250 && bf && +bf > 25) {
    proteinBase = (weightLbs * (1 - +bf / 100)) * 1.2
    notes.push('Protein set off estimated lean mass +20% (250+ lbs at higher body fat).')
  }
  const protein = Math.round(proteinBase / 5) * 5
  const fat = Math.max(50, Math.round((weightLbs * (goal === 'cut' ? 0.35 : 0.4)) / 5) * 5)
  const carbs = Math.max(0, Math.round(((target - protein * 4 - fat * 9) / 4) / 5) * 5)
  if (!bf) notes.push('No body fat estimate — first two weeks of scale data matter more than the formula.')
  return { tdee, target, protein, carbs, fat, notes }
}

export default function CoachClients() {
  const [clients, setClients] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [maxes, setMaxes] = useState([])          // [{id?, lift_name, max_weight}]
  const [savedId, setSavedId] = useState(null)
  const [originalEmail, setOriginalEmail] = useState('')
  const [search, setSearch] = useState('')
  const [rm, setRm] = useState({ lift: '', weight: '', reps: '' })
  const [rating, setRating] = useState({ retention: null, mindset: null, notes: '' })
  const [photosFor, setPhotosFor] = useState(null)     // client id with timeline open
  const [timeline, setTimeline] = useState({})         // clientId -> rows
  const [calc, setCalc] = useState({ weightLbs: '', age: '', sex: 'male', hft: '', hin: '', bf: '', activity: 'working-talent', goal: 'cut' })
  const [calcResult, setCalcResult] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [leadHistory, setLeadHistory] = useState({})   // profileId -> { lead, activity[] }

  async function load() {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'client').order('full_name')
    setClients(data || [])
    // Which of these came in through the pipeline, so their pre-sale history shows on the client.
    // Ordered newest-first and first-write-wins, so a win-back lead doesn't hide the original.
    const { data: converted } = await supabase.from('leads').select('*')
      .not('converted_profile_id', 'is', null).order('created_at', { ascending: false })
    const map = {}
    for (const l of converted || []) {
      if (!map[l.converted_profile_id]) map[l.converted_profile_id] = { lead: l, activity: [] }
    }
    setLeadHistory(map)
  }
  useEffect(() => { load() }, [])

  function runCalc() {
    const { weightLbs, age, hft } = calc
    if (!+weightLbs || !+age || !+hft) { setCalcResult({ error: 'Need at least weight, age, and height.' }) ; return }
    setCalcResult(calcMacros({ ...calc, weightLbs: +calc.weightLbs, age: +calc.age, hft: +calc.hft, hin: +calc.hin || 0, bf: calc.bf }))
  }

  function applyCalc() {
    if (!calcResult || calcResult.error) return
    setForm(f => ({
      ...f,
      phase: calc.goal,
      protein_g: calcResult.protein, carbs_g: calcResult.carbs, fat_g: calcResult.fat, calories: calcResult.target,
    }))
  }

  async function resetPassword(c) {
    const pw = prompt(`New temporary password for ${c.full_name || c.email || 'this client'}:\n\nGive it to them directly — they can sign in with it right away.`, '')
    if (!pw) return
    if (pw.length < 6) { alert('Password must be at least 6 characters.'); return }
    const { error } = await supabase.rpc('admin_reset_password', { target_user_id: c.id, new_password: pw })
    if (error) { alert('Could not reset password: ' + error.message); return }
    alert(`Done — ${c.full_name || c.email || 'their'} password is now set. Give it to them along with your Vercel URL.`)
  }

  async function startEdit(c) {
    setEditing(c.id)
    const { data: r } = await supabase.from('client_ratings').select('*').eq('client_id', c.id).maybeSingle()
    setRating({ retention: r?.retention || null, mindset: r?.mindset || null, notes: r?.notes || '' })
    setCalcResult(null)
    setForm({ full_name: c.full_name, phase: c.phase, protein_g: c.protein_g, carbs_g: c.carbs_g, fat_g: c.fat_g, calories: c.calories, email: c.email || '', checkin_day: c.checkin_day ?? null, status: c.status || 'active', payment_plan: c.payment_plan || '', contract_ends: c.contract_ends || '', split_ends: c.split_ends || '', start_date: c.start_date || '', payment_date: c.payment_date || '' })
    setOriginalEmail(c.email || '')
    // Pull their pre-sale timeline in if they came through the pipeline.
    const hist = leadHistory[c.id]
    if (hist && hist.activity.length === 0) {
      const { data: acts } = await supabase.from('lead_activity').select('*')
        .eq('lead_id', hist.lead.id).order('occurred_at', { ascending: false })
      setLeadHistory(h => ({ ...h, [c.id]: { ...hist, activity: acts || [] } }))
    }
    const { data } = await supabase.from('client_maxes').select('*').eq('client_id', c.id).order('lift_name')
    setMaxes(data || [])
  }

  function setMax(i, field, value) {
    setMaxes(m => m.map((x, j) => j === i ? { ...x, [field]: value } : x))
  }

  async function save(id) {
    if (form.email.trim() && form.email.trim() !== originalEmail) {
      const { error: emailErr } = await supabase.rpc('admin_update_email', { target_user_id: id, new_email: form.email.trim() })
      if (emailErr) { alert('Could not update email: ' + emailErr.message); return }
    }
    const current = clients.find(c => c.id === id)
    const statusChanged = (current?.status || 'active') !== form.status
    await supabase.from('profiles').update({
      full_name: form.full_name, phase: form.phase,
      protein_g: +form.protein_g || 0, carbs_g: +form.carbs_g || 0,
      fat_g: +form.fat_g || 0, calories: +form.calories || 0,
      checkin_day: form.checkin_day,
      status: form.status,
      payment_plan: form.payment_plan?.trim() || null,
      contract_ends: form.contract_ends || null,
      split_ends: form.split_ends || null,
      start_date: form.start_date || null,
      payment_date: form.payment_date || null,
      // Only restamp when the status genuinely moved, so "12d paused" stays honest.
      ...(statusChanged ? { status_changed_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    for (const m of maxes) {
      if (!m.lift_name?.trim()) continue
      await supabase.from('client_maxes').upsert({
        client_id: id, lift_name: m.lift_name.trim(), max_weight: +m.max_weight || 0
      }, { onConflict: 'client_id,lift_name' })
    }
    if (rating.retention || rating.mindset || rating.notes) {
      await supabase.from('client_ratings').upsert({
        client_id: id, retention: rating.retention, mindset: rating.mindset, notes: rating.notes,
      }, { onConflict: 'client_id' })
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

  const filteredClients = clients
    .filter(c => statusFilter === 'all' ? true : (c.status || 'active') === statusFilter)
    .filter(c => ((c.full_name || '') + ' ' + (c.email || '')).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.full_name ? 1 : 0) - (b.full_name ? 1 : 0))

  return (
    <div>
      <div className="eyebrow">Roster</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Clients</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 22 }}>
        To add a client: Supabase → Authentication → Users → Add user. They appear here after first sign-in.
      </p>

      {clients.some(c => !c.full_name) && (
        <div className="card" style={{ borderLeft: '3px solid var(--orange)', marginBottom: 16 }}>
          <strong style={{ fontSize: 13.5, color: 'var(--orange-hot)' }}>
            {clients.filter(c => !c.full_name).length} client(s) still need a name set
          </strong>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Match the email under each one to who you invited, then hit Edit to fill in their name.</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'paused', label: 'Paused' },
          { key: 'exited', label: 'Exited' },
        ].map(f => {
          const n = f.key === 'all' ? clients.length : clients.filter(c => (c.status || 'active') === f.key).length
          return (
            <button key={f.key} className={statusFilter === f.key ? 'btn' : 'btn-ghost'}
              style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setStatusFilter(f.key)}>
              {f.label} ({n})
            </button>
          )
        })}
      </div>

      <input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 16 }} />

      {filteredClients.length === 0 && <div className="card muted">{clients.length === 0 ? 'No clients yet.' : 'No matches.'}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredClients.map(c => (
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
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Email (also their login)</label>
                  <input type="email" value={form.email} placeholder="client@email.com" onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 11.5 }}>Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="exited">Exited</option>
                    </select>
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 11.5 }}>Check-in day (their weekly reminder anchors to this)</label>
                    <select value={form.checkin_day === null ? '' : form.checkin_day} onChange={e => setForm({ ...form, checkin_day: e.target.value === '' ? null : +e.target.value })}>
                      <option value="">Not set — use rolling reminder</option>
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Client details</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 6 }}>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5 }}>Start date</label>
                      <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                    </div>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5 }}>Contract ends</label>
                      <input type="date" value={form.contract_ends} onChange={e => setForm({ ...form, contract_ends: e.target.value })} />
                    </div>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5 }}>Split ends</label>
                      <input type="date" value={form.split_ends} onChange={e => setForm({ ...form, split_ends: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginTop: 8 }}>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5 }}>Payment plan</label>
                      <input placeholder="e.g. $200/mo, autopay" value={form.payment_plan} onChange={e => setForm({ ...form, payment_plan: e.target.value })} />
                    </div>
                    <div>
                      <label className="muted" style={{ fontSize: 11.5 }}>Payment date</label>
                      <input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
                    </div>
                  </div>
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

                  <div style={{ background: 'var(--steel)', borderRadius: 8, padding: 10, marginTop: 10 }}>
                    <span className="eyebrow" style={{ fontSize: 10 }}>1RM estimator (Epley formula)</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr auto', gap: 6, marginTop: 6 }}>
                      <input placeholder="Lift name" value={rm.lift} onChange={e => setRm({ ...rm, lift: e.target.value })} style={{ padding: '6px 8px', fontSize: 12.5 }} />
                      <input inputMode="decimal" placeholder="Weight lifted" value={rm.weight} onChange={e => setRm({ ...rm, weight: e.target.value })} style={{ padding: '6px 8px', fontSize: 12.5 }} />
                      <input inputMode="numeric" placeholder="Reps (≤10)" value={rm.reps} onChange={e => setRm({ ...rm, reps: e.target.value })} style={{ padding: '6px 8px', fontSize: 12.5 }} />
                      <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => {
                          const w = +rm.weight, r = +rm.reps
                          if (!w || !r) return
                          const est = Math.round(w * (1 + r / 30))
                          if (!rm.lift.trim()) { alert(`Estimated 1RM: ${est} lbs`); return }
                          setMaxes(m => {
                            const idx = m.findIndex(x => x.lift_name.toLowerCase() === rm.lift.trim().toLowerCase())
                            if (idx >= 0) return m.map((x,i) => i === idx ? { ...x, max_weight: est } : x)
                            return [...m, { lift_name: rm.lift.trim(), max_weight: est }]
                          })
                          setRm({ lift: '', weight: '', reps: '' })
                        }}>Estimate → fill above</button>
                    </div>
                    {(+rm.weight && +rm.reps) ? <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>≈ {Math.round(+rm.weight * (1 + (+rm.reps) / 30))} lbs — hit Save below to store it</p> : null}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Starting macros calculator</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 8 }}>
                    <input inputMode="decimal" placeholder="Weight lbs" value={calc.weightLbs} onChange={e => setCalc({ ...calc, weightLbs: e.target.value })} />
                    <input inputMode="numeric" placeholder="Age" value={calc.age} onChange={e => setCalc({ ...calc, age: e.target.value })} />
                    <select value={calc.sex} onChange={e => setCalc({ ...calc, sex: e.target.value })}>
                      <option value="male">Male</option><option value="female">Female</option>
                    </select>
                    <input inputMode="numeric" placeholder="Ht ft" value={calc.hft} onChange={e => setCalc({ ...calc, hft: e.target.value })} />
                    <input inputMode="numeric" placeholder="Ht in" value={calc.hin} onChange={e => setCalc({ ...calc, hin: e.target.value })} />
                    <input inputMode="numeric" placeholder="BF% (opt)" value={calc.bf} onChange={e => setCalc({ ...calc, bf: e.target.value })} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginTop: 8 }}>
                    <select value={calc.activity} onChange={e => setCalc({ ...calc, activity: e.target.value })}>
                      <option value="lifting-only">Lifting only — 3–4x/wk, no matches</option>
                      <option value="light-schedule">Light schedule — lifting + 1 match/wk</option>
                      <option value="working-talent">Working talent — lifting + weekly TV/matches + travel</option>
                      <option value="heavy-schedule">Heavy schedule — multiple matches/wk + training</option>
                    </select>
                    <select value={calc.goal} onChange={e => setCalc({ ...calc, goal: e.target.value })}>
                      <option value="cut">Cut</option><option value="recomp">Recomp</option><option value="build">Build</option>
                    </select>
                    <button className="btn-ghost" onClick={runCalc}>Calculate</button>
                  </div>
                  {calcResult && !calcResult.error && (
                    <div style={{ background: 'var(--steel)', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        Maintenance {calcResult.tdee} kcal → Start <span style={{ color: 'var(--orange-hot)' }}>{calcResult.target} kcal</span> · P {calcResult.protein} / C {calcResult.carbs} / F {calcResult.fat}
                      </div>
                      {calcResult.notes.map((n, i) => <div key={i} className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{n}</div>)}
                      <button className="btn" style={{ padding: '8px 16px', fontSize: 12, marginTop: 8 }} onClick={applyCalc}>Apply to targets ↑</button>
                    </div>
                  )}
                  {calcResult?.error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{calcResult.error}</div>}
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Health Points — your read (not auto-computed)</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {[['retention', 'Retention — intent to continue'], ['mindset', 'Mindset — awareness of blocks']].map(([key, label]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, minWidth: 190 }}>{label}</span>
                        {['red','yellow','green'].map(color => (
                          <button key={color} onClick={() => setRating(r => ({ ...r, [key]: r[key] === color ? null : color }))}
                            style={{
                              width: 20, height: 20, borderRadius: '50%',
                              background: color === 'red' ? '#D64545' : color === 'yellow' ? '#E0B23E' : '#4CAF6D',
                              border: rating[key] === color ? '2px solid #fff' : '2px solid transparent',
                              opacity: rating[key] && rating[key] !== color ? 0.35 : 1,
                            }} title={color} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <textarea rows="2" placeholder="Notes on where they're at (optional)" value={rating.notes} onChange={e => setRating({ ...rating, notes: e.target.value })} style={{ marginTop: 8 }} />
                </div>

                {leadHistory[c.id] && (
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <span className="eyebrow" style={{ fontSize: 10 }}>Before they signed up</span>
                    <div style={{ fontSize: 12.5, marginTop: 6 }}>
                      {leadHistory[c.id].lead.source && <div className="muted">Came from: {leadHistory[c.id].lead.source}</div>}
                      {leadHistory[c.id].lead.notes && <div style={{ marginTop: 4 }}>{leadHistory[c.id].lead.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                      {leadHistory[c.id].activity.map(a => (
                        <div key={a.id} style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                          <span className="muted" style={{ minWidth: 62, flexShrink: 0 }}>
                            {new Date(a.occurred_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{ color: a.kind === 'stage_change' ? 'var(--muted)' : undefined }}>{a.body}</span>
                        </div>
                      ))}
                      {leadHistory[c.id].activity.length === 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>Nothing was logged before they converted.</div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={() => save(c.id)}>Save</button>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <strong style={{ fontSize: 16, color: c.full_name ? undefined : 'var(--orange-hot)' }}>{c.full_name || 'Needs a name'}</strong>
                  {c.status && c.status !== 'active' && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5,
                      marginLeft: 8, padding: '2px 8px', borderRadius: 20,
                      background: 'var(--steel)', color: c.status === 'exited' ? 'var(--red)' : 'var(--orange-hot)',
                    }}>{c.status}</span>
                  )}
                  {c.email && <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{c.email}</div>}
                  <div className="muted" style={{ fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
                    {c.phase} · P {c.protein_g} / C {c.carbs_g} / F {c.fat_g} · {c.calories} kcal
                  </div>
                  {(c.start_date || c.payment_plan || c.payment_date || c.contract_ends || c.split_ends) && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      {[
                        c.start_date && `Started ${new Date(c.start_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
                        c.payment_plan,
                        c.payment_date && `Payment ${new Date(c.payment_date + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
                        c.contract_ends && `Contract ends ${new Date(c.contract_ends + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
                        c.split_ends && `Split ends ${new Date(c.split_ends + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/coach/logs/${c.id}`} className="btn" style={{ textDecoration: 'none', display: 'inline-block' }}>View Logs</Link>
                  <a href={`/coach/print/${c.id}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-block' }}>Print summary</a>
                  <button className="btn-ghost" onClick={() => resetPassword(c)}>Reset password</button>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(3, minmax(170px, 1fr))', gap: 10, minWidth: 680 }}>
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
                        <a key={i} href={u} target="_blank" rel="noreferrer"><img className="thumb" src={u} alt="progress" style={{ height: 150, borderRadius: 8 }} /></a>
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
            ? <a href={row[l]} target="_blank" rel="noreferrer"><img className="thumb" src={row[l]} alt={l} style={{ width: '100%', borderRadius: 8, display: 'block' }} /></a>
            : <div style={{ background: 'var(--steel)', borderRadius: 6, height: 60, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 11 }}>—</div>}
        </div>
      ))}
    </>
  )
}
