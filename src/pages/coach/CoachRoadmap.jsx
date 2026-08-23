import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const TYPE_COLOR = { cut: '#FF5A00', build: '#4A6FA5', recomp: '#7C5CBF', maintain: '#3E8E7E', peak: '#FF6200' }
const TYPE_LABEL = { cut: 'Cut', build: 'Build', recomp: 'Recomp', maintain: 'Maintain', peak: 'Peak' }
const EMPTY = { name: '', phase_type: 'build', start_date: '', end_date: '', protein_g: '', carbs_g: '', fat_g: '', calories: '', notes: '' }

export default function CoachRoadmap() {
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [phases, setPhases] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('role', 'client').order('full_name').then(({ data }) => setClients(data || []))
  }, [])

  async function loadPhases(id) {
    const { data } = await supabase.from('client_phases').select('*').eq('client_id', id).order('start_date')
    setPhases(data || [])
  }

  function selectClient(id) {
    setClientId(id); setEditingId(null); setForm(EMPTY)
    if (id) loadPhases(id)
  }

  async function save() {
    if (!form.name.trim() || !form.start_date || !form.end_date || !clientId) return
    const row = {
      client_id: clientId, name: form.name.trim(), phase_type: form.phase_type,
      start_date: form.start_date, end_date: form.end_date,
      protein_g: form.protein_g === '' ? null : +form.protein_g,
      carbs_g: form.carbs_g === '' ? null : +form.carbs_g,
      fat_g: form.fat_g === '' ? null : +form.fat_g,
      calories: form.calories === '' ? null : +form.calories,
      notes: form.notes,
    }
    if (editingId) await supabase.from('client_phases').update(row).eq('id', editingId)
    else await supabase.from('client_phases').insert(row)
    setForm(EMPTY); setEditingId(null)
    loadPhases(clientId)
  }

  function edit(p) {
    setEditingId(p.id)
    setForm({
      name: p.name, phase_type: p.phase_type, start_date: p.start_date, end_date: p.end_date,
      protein_g: p.protein_g ?? '', carbs_g: p.carbs_g ?? '', fat_g: p.fat_g ?? '', calories: p.calories ?? '', notes: p.notes || '',
    })
  }

  async function remove(id) {
    if (!confirm('Delete this phase?')) return
    await supabase.from('client_phases').delete().eq('id', id)
    loadPhases(clientId)
  }

  const today = new Date().toISOString().slice(0,10)

  return (
    <div>
      <div className="eyebrow">Big picture</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 20px' }}>Roadmap</h1>

      <select value={clientId} onChange={e => selectClient(e.target.value)} style={{ marginBottom: 20, maxWidth: 320 }}>
        <option value="">Select a client…</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0,8)}</option>)}
      </select>

      {clientId && (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>{editingId ? 'Edit phase' : 'Add phase'}</span>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
              <input placeholder="Phase name (e.g. Off-Season Build)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select value={form.phase_type} onChange={e => setForm({ ...form, phase_type: e.target.value })}>
                {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label className="muted" style={{ fontSize: 11.5 }}>Start</label><input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><label className="muted" style={{ fontSize: 11.5 }}>End</label><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              <input inputMode="numeric" placeholder="Protein (opt)" value={form.protein_g} onChange={e => setForm({ ...form, protein_g: e.target.value })} />
              <input inputMode="numeric" placeholder="Carbs (opt)" value={form.carbs_g} onChange={e => setForm({ ...form, carbs_g: e.target.value })} />
              <input inputMode="numeric" placeholder="Fat (opt)" value={form.fat_g} onChange={e => setForm({ ...form, fat_g: e.target.value })} />
              <input inputMode="numeric" placeholder="Calories (opt)" value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })} />
            </div>
            <textarea rows="2" placeholder="What's the goal of this phase? (shown to client)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={save}>{editingId ? 'Save changes' : 'Add phase'}</button>
              {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY) }}>Cancel</button>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {phases.map(p => {
              const current = p.start_date <= today && today <= p.end_date
              const color = TYPE_COLOR[p.phase_type]
              return (
                <div className="card" key={p.id} style={{ borderLeft: `4px solid ${color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 15 }}>{p.name}</strong>
                        <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>{TYPE_LABEL[p.phase_type]}</span>
                        {current && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>● Current</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{p.start_date} → {p.end_date}</div>
                      {(p.protein_g || p.calories) && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                          {p.calories ? `${p.calories} kcal · ` : ''}P {p.protein_g || '—'} / C {p.carbs_g || '—'} / F {p.fat_g || '—'}
                        </div>
                      )}
                      {p.notes && <p style={{ fontSize: 13, marginTop: 6 }}>{p.notes}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => edit(p)}>Edit</button>
                      <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12, color: 'var(--red)' }} onClick={() => remove(p.id)}>✕</button>
                    </div>
                  </div>
                </div>
              )
            })}
            {phases.length === 0 && <div className="card muted">No phases yet — build out the year above.</div>}
          </div>
        </>
      )}
    </div>
  )
}
