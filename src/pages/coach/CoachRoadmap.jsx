import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { PHASE_TYPES, typeOf, phaseWeeks, endFor, addDays, planBackFromEvent } from '../../lib/phases'
import { PlannerTiles, PlannerTable, PlannerTimeline, EventBanner } from './PhasePlanner'

const EMPTY = { name: '', phase_type: 'cut', start_date: '', weeks: '12', end_date: '', protein_g: '', carbs_g: '', fat_g: '', calories: '', notes: '' }

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4 }}>
        <span className="eyebrow" style={{ fontSize: 12 }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function CoachRoadmap() {
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [phases, setPhases] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [ev, setEv] = useState({ name: '', date: '' })
  const [back, setBack] = useState({ cutWeeks: 12, dietBreak: false, peakWeeks: 1, reverseWeeks: 6 })
  const [backMsg, setBackMsg] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, start_date, event_name, event_date').eq('role', 'client').neq('status', 'exited').order('full_name').then(({ data }) => setClients(data || []))
  }, [])

  async function loadPhases(id) {
    const { data } = await supabase.from('client_phases').select('*').eq('client_id', id).order('start_date')
    setPhases(data || [])
    return data || []
  }

  // A new phase starts the day after the last one ends (or the client's start
  // date / today), so laying out a year is just: pick a type, type the weeks.
  function blankFor(list, id = clientId) {
    const lastEnd = list.reduce((m, p) => (!m || p.end_date > m ? p.end_date : m), null)
    const cl = clients.find(c => c.id === id)
    const start = lastEnd ? addDays(lastEnd, 1) : (cl?.start_date || localDateStr())
    return { ...EMPTY, start_date: start, end_date: endFor(start, EMPTY.weeks) }
  }

  async function selectClient(id) {
    setClientId(id); setEditingId(null); setError(''); setBackMsg('')
    const cl = clients.find(c => c.id === id)
    setEv({ name: cl?.event_name || '', date: cl?.event_date || '' })
    if (!id) { setPhases([]); return }
    const list = await loadPhases(id)
    setForm(blankFor(list, id))
  }

  const setStart = v => setForm(f => ({ ...f, start_date: v, end_date: v && f.weeks ? endFor(v, f.weeks) : f.end_date }))
  const setWeeks = v => setForm(f => ({ ...f, weeks: v, end_date: f.start_date && +v > 0 ? endFor(f.start_date, v) : f.end_date }))
  const setEnd = v => setForm(f => ({ ...f, end_date: v, weeks: f.start_date && v >= f.start_date ? String(phaseWeeks({ start_date: f.start_date, end_date: v })) : f.weeks }))

  const autoCals = (+form.protein_g || 0) * 4 + (+form.carbs_g || 0) * 4 + (+form.fat_g || 0) * 9

  async function save() {
    setError('')
    if (!clientId || !form.start_date || !form.end_date) { setError('Pick a start date and a length.'); return }
    if (form.end_date < form.start_date) { setError('The end date is before the start date.'); return }
    const overlap = phases.find(p => p.id !== editingId && p.start_date <= form.end_date && form.start_date <= p.end_date)
    if (overlap && !window.confirm(`This overlaps "${overlap.name}" (${overlap.start_date} → ${overlap.end_date}). Save anyway?`)) return
    const row = {
      client_id: clientId, name: form.name.trim() || typeOf(form.phase_type).label, phase_type: form.phase_type,
      start_date: form.start_date, end_date: form.end_date,
      protein_g: form.protein_g === '' ? null : +form.protein_g,
      carbs_g: form.carbs_g === '' ? null : +form.carbs_g,
      fat_g: form.fat_g === '' ? null : +form.fat_g,
      calories: form.calories === '' ? null : +form.calories,
      notes: form.notes,
    }
    const { error: err } = editingId
      ? await supabase.from('client_phases').update(row).eq('id', editingId)
      : await supabase.from('client_phases').insert(row)
    if (err) {
      setError(/check constraint/i.test(err.message) && ['reverse', 'diet_break'].includes(form.phase_type)
        ? 'Reverse and Diet break need the Update 91 SQL run in Supabase first.'
        : 'Could not save: ' + err.message)
      return
    }
    setEditingId(null)
    const list = await loadPhases(clientId)
    setForm(blankFor(list))
  }

  function edit(p) {
    setEditingId(p.id); setError('')
    setForm({
      name: p.name === typeOf(p.phase_type).label ? '' : p.name, phase_type: p.phase_type, start_date: p.start_date, end_date: p.end_date,
      weeks: String(phaseWeeks(p)), protein_g: p.protein_g ?? '', carbs_g: p.carbs_g ?? '', fat_g: p.fat_g ?? '', calories: p.calories ?? '', notes: p.notes || '',
    })
    try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) } catch { /* jsdom */ }
  }

  async function remove(id) {
    if (!window.confirm('Delete this phase?')) return
    await supabase.from('client_phases').delete().eq('id', id)
    const list = await loadPhases(clientId)
    if (!editingId) setForm(blankFor(list))
  }

  async function saveEvent(next) {
    setEv(next)
    const { error: err } = await supabase.from('profiles').update({ event_name: next.name.trim(), event_date: next.date || null }).eq('id', clientId)
    if (err) { setError(/event_/.test(err.message) ? 'The event needs the Update 104 SQL run in Supabase first.' : err.message); return }
    setClients(cs => cs.map(c => (c.id === clientId ? { ...c, event_name: next.name.trim(), event_date: next.date || null } : c)))
  }

  // Lay out cut -> (diet break) -> peak week -> reverse, ending peak week on the event day.
  async function buildFromEvent() {
    setBackMsg(''); setError('')
    if (!ev.date) { setError('Set the event date first.'); return }
    const plan = planBackFromEvent(ev.date, { ...back, earliest: localDateStr() })
    const clash = phases.filter(p => plan.phases.some(n => p.start_date <= n.end_date && n.start_date <= p.end_date))
    const msg = `Add ${plan.phases.length} phases: ${plan.phases.map(p => `${typeOf(p.phase_type).label} (${phaseWeeks(p)}w)`).join(' → ')}?` +
      (plan.warning ? `\n\n${plan.warning}` : '') + (clash.length ? `\n\n${clash.length} existing phase(s) overlap these dates — delete them after if they're replaced.` : '')
    if (!window.confirm(msg)) return
    const { error: err } = await supabase.from('client_phases').insert(plan.phases.map(p => ({ ...p, client_id: clientId, notes: p.phase_type === 'peak' ? `Peak for ${ev.name || 'the event'}` : '' })))
    if (err) { setError(/check constraint/i.test(err.message) ? 'Peak / reverse / diet break need the Update 91 SQL run first.' : 'Could not add: ' + err.message); return }
    setBackMsg(`Added ${plan.phases.length} phases.${plan.warning ? ' ' + plan.warning : ''} Fill in the macros on each one.`)
    const list = await loadPhases(clientId)
    setForm(blankFor(list))
  }

  const lbl = { fontSize: 11.5 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div className="eyebrow">Big picture</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>Phase Planner</h1>
        <p className="muted" style={{ fontSize: 13 }}>Lay out each client's phases in order. Status, week of phase and the timeline update with today's date. Clients see this under Roadmap.</p>
      </div>

      <select value={clientId} onChange={e => selectClient(e.target.value)} style={{ maxWidth: 320 }}>
        <option value="">Select a client…</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}</option>)}
      </select>

      {clientId && <>
        {ev.date && <EventBanner name={ev.name} date={ev.date} />}
        <PlannerTiles phases={phases} />

        <Section title="Phases">
          {phases.length
            ? <div className="card" style={{ padding: 0 }}><PlannerTable phases={phases} onEdit={edit} onDelete={remove} /></div>
            : <div className="card muted">No phases yet. Add the first one below.</div>}
        </Section>

        {phases.length > 0 && (
          <Section title="Timeline">
            <div className="card"><PlannerTimeline phases={phases} eventDate={ev.date} eventName={ev.name} /></div>
          </Section>
        )}

        <Section title="Event · plan back from it">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <div><label className="muted" style={lbl}>Event (shown to the client)</label>
                <input value={ev.name} placeholder="e.g. TV taping, show, photoshoot" onChange={e => setEv({ ...ev, name: e.target.value })} onBlur={() => saveEvent(ev)} /></div>
              <div><label className="muted" style={lbl}>Event date</label>
                <input type="date" value={ev.date || ''} onChange={e => saveEvent({ ...ev, date: e.target.value })} /></div>
              {ev.date && <div style={{ alignSelf: 'end' }}><button className="btn-ghost" onClick={() => saveEvent({ name: '', date: '' })} style={{ padding: '8px 12px', fontSize: 12 }}>Clear event</button></div>}
            </div>
            {ev.date && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div style={{ width: 90 }}><label className="muted" style={lbl}>Cut weeks</label><input inputMode="numeric" value={back.cutWeeks} onChange={e => setBack({ ...back, cutWeeks: e.target.value })} /></div>
                <div style={{ width: 90 }}><label className="muted" style={lbl}>Peak weeks</label><input inputMode="numeric" value={back.peakWeeks} onChange={e => setBack({ ...back, peakWeeks: e.target.value })} /></div>
                <div style={{ width: 110 }}><label className="muted" style={lbl}>Reverse after</label><input inputMode="numeric" value={back.reverseWeeks} onChange={e => setBack({ ...back, reverseWeeks: e.target.value })} /></div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, paddingBottom: 10 }}>
                  <input type="checkbox" checked={back.dietBreak} onChange={e => setBack({ ...back, dietBreak: e.target.checked })} style={{ width: 'auto' }} /> 1-week diet break mid-cut (8+ wk cuts)
                </label>
                <button className="btn" onClick={buildFromEvent} style={{ padding: '10px 16px', fontSize: 13 }}>Build phases back from the event</button>
              </div>
            )}
            {backMsg && <p style={{ fontSize: 12.5, color: 'var(--orange-hot)' }}>{backMsg}</p>}
            <p className="muted" style={{ fontSize: 11.5 }}>Peak week ends on the event day, the cut runs right up to it, and the reverse starts the day after. If there isn't room before today, the cut is shortened to fit.</p>
          </div>
        </Section>

        <Section title={editingId ? 'Edit phase' : 'Add phase'}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <div><label className="muted" style={lbl}>Phase</label>
                <select value={form.phase_type} onChange={e => setForm({ ...form, phase_type: e.target.value })}>
                  {Object.entries(PHASE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select></div>
              <div><label className="muted" style={lbl}>Start</label><input type="date" value={form.start_date} onChange={e => setStart(e.target.value)} /></div>
              <div><label className="muted" style={lbl}>Weeks</label><input inputMode="numeric" value={form.weeks} onChange={e => setWeeks(e.target.value)} /></div>
              <div><label className="muted" style={lbl}>End (auto)</label><input type="date" value={form.end_date} onChange={e => setEnd(e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              <div><label className="muted" style={lbl}>Protein (g)</label><input inputMode="numeric" value={form.protein_g} onChange={e => setForm({ ...form, protein_g: e.target.value })} /></div>
              <div><label className="muted" style={lbl}>Carbs (g)</label><input inputMode="numeric" value={form.carbs_g} onChange={e => setForm({ ...form, carbs_g: e.target.value })} /></div>
              <div><label className="muted" style={lbl}>Fat (g)</label><input inputMode="numeric" value={form.fat_g} onChange={e => setForm({ ...form, fat_g: e.target.value })} /></div>
              <div><label className="muted" style={lbl}>Calories</label><input inputMode="numeric" placeholder={autoCals ? `${autoCals} (auto)` : ''} value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })} /></div>
            </div>
            <input placeholder="Name (optional — e.g. Off-season build)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea rows="2" placeholder="Goal / focus — shown to the client (e.g. Drop to ~205 lb, keep strength on main lifts)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ padding: '10px 18px', fontSize: 13 }} onClick={save}>{editingId ? 'Save changes' : 'Add phase'}</button>
              {editingId && <button className="btn-ghost" onClick={() => { setEditingId(null); setError(''); setForm(blankFor(phases)) }}>Cancel</button>}
            </div>
            <p className="muted" style={{ fontSize: 11.5 }}>New phases start the day after the last one ends. Type the weeks and the end date fills itself. Leave calories blank to use the macros.</p>
          </div>
        </Section>
      </>}
    </div>
  )
}
