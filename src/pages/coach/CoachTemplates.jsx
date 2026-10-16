import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/weeks'
import { KINDS, snapshot, applySnapshot, assignProgram, applyTrack, isEmptySnap, snapSummary } from '../../lib/plans'

const TPL_COL = { meal_plan: 'meal_template_id', habits: 'habits_template_id', supplements: 'supps_template_id', cardio: 'cardio_template_id' }

function Section({ title, sub, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ borderBottom: '3px solid var(--orange)', paddingBottom: 4 }}>
        <span style={{ color: 'var(--orange-hot)', fontWeight: 900, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase' }}>{title}</span>
        {sub && <span className="muted" style={{ fontSize: 12.5, marginLeft: 10 }}>{sub}</span>}
      </div>
      {children}
    </section>
  )
}

// Tick-box list of clients with search and select-all.
function ClientPicker({ clients, value, onChange, exclude = [], height = 220 }) {
  const [q, setQ] = useState('')
  const list = clients.filter(c => !exclude.includes(c.id) && (!q || (c.full_name || '').toLowerCase().includes(q.toLowerCase())))
  const all = list.length > 0 && list.every(c => value.has(c.id))
  const toggle = id => { const n = new Set(value); n.has(id) ? n.delete(id) : n.add(id); onChange(n) }
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: 6, background: 'var(--steel)', alignItems: 'center' }}>
        <input placeholder="Search clients…" value={q} onChange={e => setQ(e.target.value)} style={{ padding: '5px 8px', fontSize: 12.5 }} />
        <button type="button" className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={() => { const n = new Set(value); list.forEach(c => (all ? n.delete(c.id) : n.add(c.id))); onChange(n) }}>{all ? 'Clear' : 'Select all'}</button>
        <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{value.size} picked</span>
      </div>
      <div style={{ maxHeight: height, overflowY: 'auto' }}>
        {list.map(c => (
          <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderTop: '1px solid var(--line)', fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={value.has(c.id)} onChange={() => toggle(c.id)} style={{ width: 'auto' }} />
            {c.full_name || c.id.slice(0, 8)}
            {c.status && c.status !== 'active' && <span className="muted" style={{ fontSize: 11 }}>({c.status})</span>}
          </label>
        ))}
        {list.length === 0 && <p className="muted" style={{ padding: 10, fontSize: 12.5 }}>No clients match.</p>}
      </div>
    </div>
  )
}

export default function CoachTemplates() {
  const [clients, setClients] = useState([])
  const [programs, setPrograms] = useState([])
  const [templates, setTemplates] = useState([])
  const [tracks, setTracks] = useState([])
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState([])

  // copy between clients
  const [from, setFrom] = useState('')
  const [what, setWhat] = useState(new Set(['meal_plan', 'habits', 'supplements', 'cardio']))
  const [copyProgram, setCopyProgram] = useState(false)
  const [to, setTo] = useState(new Set())
  const [scale, setScale] = useState(true)
  const [preview, setPreview] = useState({})

  // templates
  const [saveFrom, setSaveFrom] = useState({ client: '', kind: 'meal_plan', name: '' })
  const [applyTpl, setApplyTpl] = useState(null)        // template id with its apply panel open
  const [tplTo, setTplTo] = useState(new Set())

  // tracks
  const blankTrack = { name: '', description: '', price: '', program_id: '', meal_template_id: '', habits_template_id: '', supps_template_id: '', cardio_template_id: '', scale_meals: true }
  const [trackForm, setTrackForm] = useState(null)      // null | {..., id?}
  const [joinTrack, setJoinTrack] = useState(null)      // track id with its add-clients panel open
  const [joinTo, setJoinTo] = useState(new Set())
  const [joinStart, setJoinStart] = useState(localDateStr())

  async function load() {
    const [{ data: c }, { data: p }, { data: t, error }, { data: tr }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, status, track_id').eq('role', 'client').neq('status', 'exited').order('full_name'),
      supabase.from('programs').select('id, name').order('name'),
      supabase.from('plan_templates').select('*').order('kind').order('name'),
      supabase.from('tracks').select('*').order('name'),
    ])
    setMissing(!!error && /plan_templates/.test(error.message || ''))
    setClients(c || []); setPrograms(p || []); setTemplates(t || []); setTracks(tr || [])
  }
  useEffect(() => { load() }, [])
  const tplById = useMemo(() => Object.fromEntries(templates.map(t => [t.id, t])), [templates])
  const nameOf = id => clients.find(c => c.id === id)?.full_name || 'client'
  const note = msg => setLog(l => [msg, ...l].slice(0, 12))

  // preview what the source client has
  useEffect(() => {
    if (!from) { setPreview({}); return }
    let live = true
    Promise.all(Object.keys(KINDS).map(async k => [k, await snapshot(supabase, from, k).catch(() => null)])).then(async entries => {
      const { data: asg } = await supabase.from('program_assignments').select('program_id').eq('client_id', from).maybeSingle()
      if (live) setPreview({ ...Object.fromEntries(entries), program_id: asg?.program_id || null })
    })
    return () => { live = false }
  }, [from])

  async function doCopy() {
    const kinds = [...what].filter(k => !isEmptySnap(k, preview[k]))
    if (!from || !to.size || (!kinds.length && !copyProgram)) return
    const names = [...to].map(nameOf).join(', ')
    if (!window.confirm(`Copy ${[...kinds.map(k => KINDS[k]), ...(copyProgram ? ['program'] : [])].join(', ')} from ${nameOf(from)} to ${names}?\n\nTheir meal plan and cardio plan will be replaced. Habits and supplements are added (nothing they've ticked is lost).`)) return
    setBusy('copy')
    for (const id of to) {
      for (const k of kinds) await applySnapshot(supabase, id, k, preview[k], { scale: k === 'meal_plan' && scale })
      if (copyProgram && preview.program_id) await assignProgram(supabase, id, preview.program_id, localDateStr())
      note(`Copied to ${nameOf(id)}: ${[...kinds.map(k => KINDS[k]), ...(copyProgram && preview.program_id ? ['program'] : [])].join(', ')}`)
    }
    setBusy(''); setTo(new Set())
  }

  async function saveTemplate() {
    const name = saveFrom.name.trim()
    if (!saveFrom.client || !name) return
    setBusy('save')
    const data = await snapshot(supabase, saveFrom.client, saveFrom.kind)
    if (isEmptySnap(saveFrom.kind, data)) { setBusy(''); alert(`${nameOf(saveFrom.client)} has no ${KINDS[saveFrom.kind].toLowerCase()} to save.`); return }
    const { error } = await supabase.from('plan_templates').insert({ name, kind: saveFrom.kind, data })
    setBusy('')
    if (error) { alert('Could not save: ' + error.message); return }
    note(`Saved template "${name}" (${KINDS[saveFrom.kind]})`)
    setSaveFrom(s => ({ ...s, name: '' })); load()
  }
  async function applyTemplate(t) {
    if (!tplTo.size) return
    if (!window.confirm(`Apply "${t.name}" to ${[...tplTo].map(nameOf).join(', ')}?${t.kind === 'meal_plan' || t.kind === 'cardio' ? `\n\nTheir current ${KINDS[t.kind].toLowerCase()} will be replaced.` : ''}`)) return
    setBusy('apply')
    for (const id of tplTo) { await applySnapshot(supabase, id, t.kind, t.data, { scale: t.kind === 'meal_plan' }); note(`"${t.name}" → ${nameOf(id)}`) }
    setBusy(''); setTplTo(new Set()); setApplyTpl(null)
  }
  async function renameTemplate(t) {
    const name = window.prompt('Template name', t.name)
    if (!name || !name.trim()) return
    await supabase.from('plan_templates').update({ name: name.trim() }).eq('id', t.id); load()
  }
  async function deleteTemplate(t) {
    if (!window.confirm(`Delete template "${t.name}"? Clients who already have it keep their copy.`)) return
    await supabase.from('plan_templates').delete().eq('id', t.id); load()
  }

  async function saveTrack() {
    const f = trackForm
    if (!f.name.trim()) return
    const row = { name: f.name.trim(), description: f.description, price: f.price, scale_meals: f.scale_meals }
    for (const k of ['program_id', 'meal_template_id', 'habits_template_id', 'supps_template_id', 'cardio_template_id']) row[k] = f[k] || null
    const { error } = f.id ? await supabase.from('tracks').update(row).eq('id', f.id) : await supabase.from('tracks').insert(row)
    if (error) { alert('Could not save track: ' + error.message); return }
    setTrackForm(null); load()
  }
  async function deleteTrack(t) {
    if (!window.confirm(`Delete the "${t.name}" track? Its members keep their current plans.`)) return
    await supabase.from('tracks').delete().eq('id', t.id); load()
  }
  async function addToTrack(t) {
    if (!joinTo.size) return
    if (!window.confirm(`Put ${[...joinTo].map(nameOf).join(', ')} on "${t.name}" starting ${joinStart}?\n\nThis sets their program and replaces their meal plan and cardio plan with the track's.`)) return
    setBusy('track')
    for (const id of joinTo) { const done = await applyTrack(supabase, id, t, tplById, joinStart); note(`${nameOf(id)} joined "${t.name}" (${done.map(d => KINDS[d] || d).join(', ')})`) }
    setBusy(''); setJoinTo(new Set()); setJoinTrack(null); load()
  }
  async function reapplyTrack(t) {
    const members = clients.filter(c => c.track_id === t.id)
    if (!members.length) return
    if (!window.confirm(`Re-apply "${t.name}" to all ${members.length} members? Programs keep their current start dates only if unchanged; meal and cardio plans are replaced.`)) return
    setBusy('track')
    for (const c of members) {
      const { data: asg } = await supabase.from('program_assignments').select('program_id, start_date').eq('client_id', c.id).maybeSingle()
      const start = asg && asg.program_id === t.program_id ? asg.start_date : localDateStr()
      await applyTrack(supabase, c.id, t, tplById, start)
      note(`Re-applied "${t.name}" → ${c.full_name}`)
    }
    setBusy('')
  }
  async function removeFromTrack(c) {
    await supabase.from('profiles').update({ track_id: null }).eq('id', c.id); load()
  }

  if (missing) return <div className="card" style={{ color: 'var(--red)' }}>Templates and tracks need the Update 103 SQL (migration_update103_templates_tracks.sql) run in Supabase first.</div>

  const tplOptions = kind => templates.filter(t => t.kind === kind)
  const lbl = { fontSize: 11.5 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <div>
        <div className="eyebrow">Scale your coaching</div>
        <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>Templates & Tracks</h1>
        <p className="muted" style={{ fontSize: 13 }}>Copy plans between clients, save them as templates, and bundle them into group tracks you can hand to many clients at once.</p>
      </div>

      {log.length > 0 && (
        <div className="card" style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 2, borderLeft: '3px solid var(--orange)' }}>
          {log.map((l, i) => <span key={i}>✓ {l}</span>)}
        </div>
      )}

      {/* ---------------- TRACKS ---------------- */}
      <Section title="Group tracks" sub="A program + templates. Add clients and they're set up in one go.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {tracks.map(t => {
            const members = clients.filter(c => c.track_id === t.id)
            const prog = programs.find(p => p.id === t.program_id)
            return (
              <div key={t.id} className="card" style={{ borderTop: '3px solid var(--orange)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 17, textTransform: 'uppercase', letterSpacing: '.03em' }}>{t.name}</strong>
                  {t.price && <span style={{ color: 'var(--orange-hot)', fontWeight: 900 }}>{t.price}</span>}
                </div>
                {t.description && <p className="muted" style={{ fontSize: 12.5 }}>{t.description}</p>}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', fontSize: 11.5 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>Program: {prog?.name || '—'}</span>
                  {Object.entries(TPL_COL).map(([k, col]) => <span key={k} style={{ padding: '2px 8px', borderRadius: 12, border: '1px solid var(--line)', opacity: t[col] ? 1 : 0.45 }}>{KINDS[k]}: {tplById[t[col]]?.name || '—'}</span>)}
                  {t.meal_template_id && <span style={{ padding: '2px 8px', borderRadius: 12, border: '1px solid var(--orange)', color: 'var(--orange-hot)' }}>{t.scale_meals ? 'Meals scale to each client' : 'Meals as written'}</span>}
                </div>
                <div style={{ fontSize: 12.5 }}>
                  <strong>{members.length}</strong> member{members.length === 1 ? '' : 's'}{members.length > 0 && ': '}
                  {members.map((c, i) => <span key={c.id}>{i ? ', ' : ''}{c.full_name} <button aria-label={`Remove ${c.full_name} from track`} onClick={() => removeFromTrack(c)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>✕</button></span>)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => { setJoinTrack(joinTrack === t.id ? null : t.id); setJoinTo(new Set()) }}>+ Add clients</button>
                  {members.length > 0 && <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} disabled={busy === 'track'} onClick={() => reapplyTrack(t)}>Re-apply to members</button>}
                  <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setTrackForm({ ...blankTrack, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v ?? ''])) })}>Edit</button>
                  <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 12.5, color: 'var(--muted)' }} onClick={() => deleteTrack(t)}>Delete</button>
                </div>
                {joinTrack === t.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                    <ClientPicker clients={clients} value={joinTo} onChange={setJoinTo} exclude={members.map(m => m.id)} height={180} />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <label className="muted" style={lbl}>Program starts</label>
                      <input type="date" value={joinStart} onChange={e => setJoinStart(e.target.value)} style={{ maxWidth: 160, padding: '5px 8px' }} />
                      <button className="btn" disabled={!joinTo.size || busy === 'track'} onClick={() => addToTrack(t)} style={{ padding: '7px 14px', fontSize: 12.5 }}>{busy === 'track' ? 'Setting up…' : `Add ${joinTo.size || ''} to track`}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {tracks.length === 0 && !trackForm && <div className="card muted" style={{ fontSize: 13 }}>No tracks yet. Build templates below first (or save them from a client), then make a track.</div>}
        </div>
        {!trackForm && <button className="btn" style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: 13 }} onClick={() => setTrackForm(blankTrack)}>+ New track</button>}
        {trackForm && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 760 }}>
            <strong>{trackForm.id ? 'Edit track' : 'New track'}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
              <div><label className="muted" style={lbl}>Name</label><input value={trackForm.name} placeholder="e.g. Main Event Ready: Women's Track" onChange={e => setTrackForm({ ...trackForm, name: e.target.value })} /></div>
              <div><label className="muted" style={lbl}>Price (for your reference)</label><input value={trackForm.price} placeholder="$45/mo" onChange={e => setTrackForm({ ...trackForm, price: e.target.value })} /></div>
            </div>
            <div><label className="muted" style={lbl}>Description</label><input value={trackForm.description} placeholder="Who it's for and what they get" onChange={e => setTrackForm({ ...trackForm, description: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              <div><label className="muted" style={lbl}>Program</label>
                <select value={trackForm.program_id} onChange={e => setTrackForm({ ...trackForm, program_id: e.target.value })}><option value="">None</option>{programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              {Object.entries(TPL_COL).map(([k, col]) => (
                <div key={k}><label className="muted" style={lbl}>{KINDS[k]} template</label>
                  <select value={trackForm[col]} onChange={e => setTrackForm({ ...trackForm, [col]: e.target.value })}><option value="">None</option>{tplOptions(k).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              ))}
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={trackForm.scale_meals} onChange={e => setTrackForm({ ...trackForm, scale_meals: e.target.checked })} style={{ width: 'auto' }} />
              Scale the meal plan to each client's own macro targets
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={saveTrack} disabled={!trackForm.name.trim()} style={{ padding: '8px 16px', fontSize: 13 }}>Save track</button>
              <button className="btn-ghost" onClick={() => setTrackForm(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Section>

      {/* ---------------- COPY ---------------- */}
      <Section title="Copy between clients" sub="Same plan for a similar client, a training partner or family.">
        <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="muted" style={lbl}>1. Copy from</label>
            <select value={from} onChange={e => { setFrom(e.target.value); setTo(new Set()) }}>
              <option value="">Pick a client…</option>{clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <label className="muted" style={lbl}>2. What to copy</label>
            {Object.entries(KINDS).map(([k, l]) => {
              const empty = from && isEmptySnap(k, preview[k])
              return (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, opacity: empty ? 0.45 : 1 }}>
                  <input type="checkbox" disabled={!!empty} checked={what.has(k) && !empty} style={{ width: 'auto', marginTop: 3 }}
                    onChange={() => setWhat(w => { const n = new Set(w); n.has(k) ? n.delete(k) : n.add(k); return n })} />
                  <span><strong>{l}</strong>{from && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{empty ? 'nothing set up' : snapSummary(k, preview[k])}</span>}</span>
                </label>
              )
            })}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, opacity: from && !preview.program_id ? 0.45 : 1 }}>
              <input type="checkbox" disabled={!!from && !preview.program_id} checked={copyProgram} onChange={e => setCopyProgram(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
              <span><strong>Program</strong>{from && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{preview.program_id ? `${programs.find(p => p.id === preview.program_id)?.name || 'assigned'} · starts today` : 'none assigned'}</span>}</span>
            </label>
            {what.has('meal_plan') && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--orange-hot)' }}>
                <input type="checkbox" checked={scale} onChange={e => setScale(e.target.checked)} style={{ width: 'auto' }} /> Scale the meal plan to each client's own macros
              </label>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="muted" style={lbl}>3. Copy to</label>
            <ClientPicker clients={clients} value={to} onChange={setTo} exclude={from ? [from] : []} />
            <button className="btn" disabled={!from || !to.size || busy === 'copy'} onClick={doCopy} style={{ padding: '9px 16px', fontSize: 13 }}>
              {busy === 'copy' ? 'Copying…' : `Copy to ${to.size || ''} client${to.size === 1 ? '' : 's'}`}
            </button>
            <p className="muted" style={{ fontSize: 11.5 }}>Meal plan and cardio plan replace what they had. Habits and supplements are added (matching names are updated, nothing they've ticked is lost).</p>
          </div>
        </div>
      </Section>

      {/* ---------------- TEMPLATES ---------------- */}
      <Section title="Templates" sub="Saved plans you can hand to anyone.">
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <div><label className="muted" style={lbl}>Save from</label>
            <select value={saveFrom.client} onChange={e => setSaveFrom({ ...saveFrom, client: e.target.value })} style={{ minWidth: 180 }}><option value="">Client…</option>{clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></div>
          <div><label className="muted" style={lbl}>Their</label>
            <select value={saveFrom.kind} onChange={e => setSaveFrom({ ...saveFrom, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div style={{ flex: 1, minWidth: 200 }}><label className="muted" style={lbl}>Template name</label>
            <input value={saveFrom.name} placeholder="e.g. Women's cut 1,600" onChange={e => setSaveFrom({ ...saveFrom, name: e.target.value })} /></div>
          <button className="btn" disabled={!saveFrom.client || !saveFrom.name.trim() || busy === 'save'} onClick={saveTemplate} style={{ padding: '9px 16px', fontSize: 13 }}>Save template</button>
        </div>
        {Object.entries(KINDS).map(([k, l]) => {
          const list = tplOptions(k)
          if (!list.length) return null
          return (
            <div key={k} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ background: 'var(--orange)', color: '#000', fontWeight: 900, fontSize: 11.5, letterSpacing: '.08em', padding: '7px 12px' }}>{l.toUpperCase()}</div>
              {list.map(t => (
                <div key={t.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{t.name}</strong>
                    <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 160 }}>{snapSummary(k, t.data)}</span>
                    <span className="muted" style={{ fontSize: 11.5 }}>in {tracks.filter(tr => tr[TPL_COL[k]] === t.id).length} track(s)</span>
                    <button className="btn" style={{ padding: '4px 11px', fontSize: 12 }} onClick={() => { setApplyTpl(applyTpl === t.id ? null : t.id); setTplTo(new Set()) }}>Apply to clients</button>
                    <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => renameTemplate(t)}>Rename</button>
                    <button aria-label={`Delete ${t.name}`} onClick={() => deleteTemplate(t)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                  {applyTpl === t.id && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: 520 }}>
                      <ClientPicker clients={clients} value={tplTo} onChange={setTplTo} height={170} />
                      <button className="btn" disabled={!tplTo.size || busy === 'apply'} onClick={() => applyTemplate(t)} style={{ alignSelf: 'flex-start', padding: '7px 14px', fontSize: 12.5 }}>
                        {busy === 'apply' ? 'Applying…' : `Apply to ${tplTo.size || ''}`}{k === 'meal_plan' ? ' (scaled to each client)' : ''}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
        {templates.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No templates yet. Build a plan for one client the normal way, then save it here.</p>}
      </Section>
    </div>
  )
}
