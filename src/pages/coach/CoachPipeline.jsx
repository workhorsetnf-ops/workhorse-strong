import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  LayoutGrid, List, Plus, X, Trash2, Pencil, Check, ArrowLeft, ArrowRight,
  Phone, MessageSquare, Mail, StickyNote, GitBranch, Archive, RotateCcw,
  UserPlus, UserCheck, Undo2, CalendarClock, CheckCircle2,
} from 'lucide-react'

const KIND_META = {
  note:         { icon: StickyNote,    label: 'Note' },
  call:         { icon: Phone,         label: 'Call' },
  dm:           { icon: MessageSquare, label: 'DM' },
  email:        { icon: Mail,          label: 'Email' },
  stage_change: { icon: GitBranch,     label: 'Stage' },
}

const SOURCES = ['IG DM', 'IG Ad', 'Referral', 'Seminar', 'Email list', 'Word of mouth', 'Other']

function daysSince(ts) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 864e5)
}

// Stale colouring: a lead sitting in one stage is the thing worth seeing at a glance.
function staleColor(days) {
  if (days === null) return 'var(--muted)'
  if (days >= 14) return 'var(--red)'
  if (days >= 7) return 'var(--orange-hot)'
  return 'var(--muted)'
}

function money(n) {
  if (n === null || n === undefined || n === '') return null
  return '$' + Number(n).toLocaleString()
}

// Local-midnight comparison. Using new Date(dateStr) on a bare 'YYYY-MM-DD'
// parses as UTC, which reads as "yesterday" for anyone west of Greenwich —
// so a follow-up due today would show overdue. Compare the strings instead.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueState(dateStr) {
  if (!dateStr) return null
  const t = todayStr()
  if (dateStr < t) return 'overdue'
  if (dateStr === t) return 'today'
  return 'upcoming'
}

function dueLabel(dateStr) {
  const state = dueState(dateStr)
  if (!state) return null
  if (state === 'today') return 'Due today'
  const [y, m, d] = dateStr.split('-').map(Number)
  const then = new Date(y, m - 1, d)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const diff = Math.round((then - now) / 864e5)
  if (state === 'overdue') return `${Math.abs(diff)}d overdue`
  if (diff === 1) return 'Due tomorrow'
  return `Due in ${diff}d`
}

function dueColor(dateStr) {
  const state = dueState(dateStr)
  if (state === 'overdue') return 'var(--red)'
  if (state === 'today') return 'var(--orange-hot)'
  return 'var(--muted)'
}

// Date arithmetic for the quick-set buttons, kept in local time.
function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CoachPipeline() {
  const [stages, setStages] = useState([])
  const [leads, setLeads] = useState([])
  const [view, setView] = useState('board')
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newLead, setNewLead] = useState({})
  const [selected, setSelected] = useState(null)      // lead id with drawer open
  const [detail, setDetail] = useState({})            // editable copy of selected lead
  const [activity, setActivity] = useState([])
  const [newNote, setNewNote] = useState({ kind: 'note', body: '' })
  const [dragId, setDragId] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [editStages, setEditStages] = useState(false)
  const [sort, setSort] = useState({ key: 'stage', dir: 'asc' })
  const [saving, setSaving] = useState(false)
  const [profiles, setProfiles] = useState([])        // for showing who a lead converted into
  const [converting, setConverting] = useState(false)
  const [convertForm, setConvertForm] = useState(null) // null = closed
  const [dueOnly, setDueOnly] = useState(false)

  async function load() {
    const [{ data: st }, { data: ld }, { data: pf }] = await Promise.all([
      supabase.from('lead_stages').select('*').order('position'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, status, status_changed_at').eq('role', 'client').order('full_name'),
    ])
    setStages(st || [])
    setLeads(ld || [])
    setProfiles(pf || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visible = leads
    .filter(l => showArchived ? true : !l.archived)
    .filter(l => dueOnly ? ['overdue', 'today'].includes(dueState(l.next_action_date)) : true)

  // ===== ADD =====
  async function createLead() {
    const name = (newLead.full_name || '').trim()
    if (!name) { alert('Give the lead a name first.'); return }
    const firstStage = stages[0]
    const { error } = await supabase.from('leads').insert({
      full_name: name,
      email: newLead.email || null,
      phone: newLead.phone || null,
      handle: newLead.handle || null,
      source: newLead.source || '',
      deal_size: newLead.deal_size ? Number(newLead.deal_size) : null,
      stage_id: newLead.stage_id || firstStage?.id || null,
      next_action: newLead.next_action || '',
      next_action_date: newLead.next_action_date || null,
    })
    if (error) { alert('Could not add lead: ' + error.message); return }
    setNewLead({}); setAdding(false); load()
  }

  // ===== STAGE MOVES =====
  // The DB trigger restamps stage_changed_at and writes the timeline row,
  // so all the app has to send is the new stage_id.
  async function moveLead(leadId, stageId) {
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.stage_id === stageId) return
    setLeads(ls => ls.map(l => l.id === leadId
      ? { ...l, stage_id: stageId, stage_changed_at: new Date().toISOString() } : l))  // optimistic
    const { error } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId)
    if (error) { alert('Could not move lead: ' + error.message); load(); return }
    // If the drawer is open on this lead, pull the freshly-written stage_change row in.
    if (selected === leadId) {
      const { data } = await supabase.from('lead_activity').select('*')
        .eq('lead_id', leadId).order('occurred_at', { ascending: false })
      setActivity(data || [])
    }
    load()
  }

  // ===== DETAIL DRAWER =====
  async function openLead(lead) {
    setSelected(lead.id)
    setDetail({
      full_name: lead.full_name || '', email: lead.email || '', phone: lead.phone || '',
      handle: lead.handle || '', source: lead.source || '',
      deal_size: lead.deal_size ?? '', call_date: lead.call_date || '',
      notes: lead.notes || '', stage_id: lead.stage_id || '',
      next_action: lead.next_action || '', next_action_date: lead.next_action_date || '',
    })
    setNewNote({ kind: 'note', body: '' })
    const { data } = await supabase.from('lead_activity').select('*')
      .eq('lead_id', lead.id).order('occurred_at', { ascending: false })
    setActivity(data || [])
  }

  async function saveDetail() {
    setSaving(true)
    const { error } = await supabase.from('leads').update({
      full_name: detail.full_name, email: detail.email || null, phone: detail.phone || null,
      handle: detail.handle || null, source: detail.source,
      deal_size: detail.deal_size === '' ? null : Number(detail.deal_size),
      call_date: detail.call_date || null, notes: detail.notes,
      stage_id: detail.stage_id || null,
      next_action: detail.next_action || '',
      next_action_date: detail.next_action_date || null,
    }).eq('id', selected)
    setSaving(false)
    if (error) { alert('Could not save: ' + error.message); return }
    const { data } = await supabase.from('lead_activity').select('*')
      .eq('lead_id', selected).order('occurred_at', { ascending: false })
    setActivity(data || [])
    load()
  }

  async function addActivity() {
    const body = newNote.body.trim()
    if (!body) return
    const { error } = await supabase.from('lead_activity')
      .insert({ lead_id: selected, kind: newNote.kind, body })
    if (error) { alert('Could not save that: ' + error.message); return }
    await supabase.from('leads').update({ last_touch_at: new Date().toISOString() }).eq('id', selected)
    setNewNote({ kind: 'note', body: '' })
    const { data } = await supabase.from('lead_activity').select('*')
      .eq('lead_id', selected).order('occurred_at', { ascending: false })
    setActivity(data || [])
    load()
  }

  async function deleteActivity(id) {
    await supabase.from('lead_activity').delete().eq('id', id)
    setActivity(a => a.filter(x => x.id !== id))
  }

  // Ticking off a follow-up clears it and leaves a line on the timeline,
  // so the history reads as a sequence of touches rather than blank gaps.
  async function completeAction(leadId, outcome = '') {
    const { error } = await supabase.rpc('complete_next_action', {
      target_lead_id: leadId, outcome,
    })
    if (error) { alert('Could not mark that done: ' + error.message); return }
    if (selected === leadId) {
      setDetail(d => ({ ...d, next_action: '', next_action_date: '' }))
      const { data } = await supabase.from('lead_activity').select('*')
        .eq('lead_id', leadId).order('occurred_at', { ascending: false })
      setActivity(data || [])
    }
    load()
  }

  async function setArchived(leadId, val) {
    await supabase.from('leads').update({ archived: val }).eq('id', leadId)
    load()
  }

  // ===== CONVERT TO CLIENT =====
  // Creates the login via the coach-only admin_create_client function, then
  // convert_lead links the two, moves the lead to Won and archives it.
  // The lead row is deliberately kept, not deleted — that's how the pre-sale
  // history stays attached to the client afterwards.
  async function doConvert() {
    const email = (convertForm.email || '').trim()
    const pw = (convertForm.password || '').trim()
    const name = (convertForm.full_name || '').trim()
    if (!email) { alert('They need an email — it doubles as their login.'); return }
    if (pw.length < 6) { alert('Password must be at least 6 characters.'); return }

    setConverting(true)
    const { data: newId, error } = await supabase.rpc('admin_create_client', {
      new_email: email, new_password: pw, new_full_name: name,
    })
    if (error) {
      setConverting(false)
      alert('Could not create their login:\n\n' + error.message +
            '\n\nNothing was changed. The lead is still on the board.')
      return
    }
    const { error: linkErr } = await supabase.rpc('convert_lead', {
      target_lead_id: selected, target_profile_id: newId,
    })
    setConverting(false)
    if (linkErr) {
      alert('Their login was created, but linking the lead failed:\n\n' + linkErr.message +
            '\n\nThe account exists — find them under Clients. Just archive this lead by hand.')
      load(); return
    }
    setConvertForm(null)
    alert(`Done — ${name || email} is now a client.\n\nGive them this password directly: ${pw}\n\nThey sign in at your app URL with their email.`)
    const { data } = await supabase.from('lead_activity').select('*')
      .eq('lead_id', selected).order('occurred_at', { ascending: false })
    setActivity(data || [])
    load()
  }

  // ===== WIN-BACK =====
  // Paused or exited clients get pulled back onto the board as a fresh lead.
  async function winBack(profile) {
    if (leads.some(l => l.converted_profile_id === profile.id && !l.archived)) {
      alert(`${profile.full_name || 'They'} are already on the board.`); return
    }
    const firstStage = stages[0]
    const { data, error } = await supabase.from('leads').insert({
      full_name: profile.full_name || profile.email || 'Former client',
      email: profile.email,
      source: 'Win-back',
      stage_id: firstStage?.id || null,
      converted_profile_id: profile.id,   // they already have a login — never create a second one
      notes: `Former client — status: ${profile.status}.`,
    }).select().single()
    if (error) { alert('Could not add them: ' + error.message); return }
    await supabase.from('lead_activity').insert({
      lead_id: data.id, kind: 'note',
      body: `Pulled back into the pipeline from ${profile.status} client status.`,
    })
    load()
  }

  async function deleteLead(leadId) {
    const l = leads.find(x => x.id === leadId)
    if (!confirm(`Delete ${l?.full_name || 'this lead'} and their whole history? This can't be undone.\n\nIf you just want them off the board, use Archive instead.`)) return
    await supabase.from('leads').delete().eq('id', leadId)
    setSelected(null); load()
  }

  // ===== STAGE EDITING =====
  async function renameStage(stage) {
    const name = prompt('Stage name:', stage.name)
    if (!name || name === stage.name) return
    await supabase.from('lead_stages').update({ name }).eq('id', stage.id)
    load()
  }

  async function moveStage(stage, dir) {
    const i = stages.findIndex(s => s.id === stage.id)
    const j = i + dir
    if (j < 0 || j >= stages.length) return
    const other = stages[j]
    await Promise.all([
      supabase.from('lead_stages').update({ position: other.position }).eq('id', stage.id),
      supabase.from('lead_stages').update({ position: stage.position }).eq('id', other.id),
    ])
    load()
  }

  async function addStage() {
    const name = prompt('New stage name:')
    if (!name) return
    const pos = Math.max(0, ...stages.map(s => s.position)) + 1
    await supabase.from('lead_stages').insert({ name, position: pos })
    load()
  }

  async function deleteStage(stage) {
    const count = leads.filter(l => l.stage_id === stage.id).length
    if (count > 0) { alert(`"${stage.name}" still has ${count} lead(s) in it. Move them somewhere else first.`); return }
    if (!confirm(`Delete the "${stage.name}" stage?`)) return
    await supabase.from('lead_stages').delete().eq('id', stage.id)
    load()
  }

  // ===== SUMMARY =====
  const wonStage = stages.find(s => s.is_won)
  const lostStage = stages.find(s => s.is_lost)
  const openLeads = visible.filter(l => l.stage_id !== wonStage?.id && l.stage_id !== lostStage?.id)
  const openValue = openLeads.reduce((sum, l) => sum + (Number(l.deal_size) || 0), 0)
  const wonThisMonth = leads.filter(l => {
    if (l.stage_id !== wonStage?.id) return false
    const d = new Date(l.stage_changed_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const wonValue = wonThisMonth.reduce((sum, l) => sum + (Number(l.deal_size) || 0), 0)
  const stale = openLeads.filter(l => (daysSince(l.stage_changed_at) ?? 0) >= 7).length
  const dueNow = leads.filter(l => !l.archived && ['overdue', 'today'].includes(dueState(l.next_action_date))).length

  // ===== LIST SORT =====
  const stagePos = id => stages.find(s => s.id === id)?.position ?? 999
  const sorted = [...visible].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'name') return dir * (a.full_name || '').localeCompare(b.full_name || '')
    if (sort.key === 'stage') return dir * (stagePos(a.stage_id) - stagePos(b.stage_id))
    if (sort.key === 'days') return dir * ((daysSince(a.stage_changed_at) ?? 0) - (daysSince(b.stage_changed_at) ?? 0))
    if (sort.key === 'value') return dir * ((Number(a.deal_size) || 0) - (Number(b.deal_size) || 0))
    if (sort.key === 'due') {
      // Leads with nothing scheduled always sink to the bottom, either direction —
      // flipping the sort should reorder what's due, not bury it under blanks.
      if (!a.next_action_date && !b.next_action_date) return 0
      if (!a.next_action_date) return 1
      if (!b.next_action_date) return -1
      return dir * a.next_action_date.localeCompare(b.next_action_date)
    }
    return 0
  })
  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const selectedLead = leads.find(l => l.id === selected)

  if (loading) return <div className="card muted">Loading pipeline…</div>

  return (
    <div>
      <div className="eyebrow">Sales</div>
      <h1 style={{ fontSize: 28, margin: '6px 0 6px' }}>Pipeline</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
        Everyone who hasn't paid yet. Drag a card to move them a stage forward — the timeline logs it for you.
      </p>

      {/* ===== SUMMARY STRIP ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Open leads', value: openLeads.length },
          { label: 'Pipeline value', value: money(openValue) || '$0' },
          { label: 'Won this month', value: `${wonThisMonth.length}${wonValue ? ' · ' + money(wonValue) : ''}` },
          { label: 'Follow-ups due', value: dueNow, tone: dueNow > 0 ? 'var(--red)' : null },
          { label: 'Going cold (7d+)', value: stale, tone: stale > 0 ? 'var(--orange-hot)' : null },
        ].map(s => (
          <div className="card" key={s.label} style={{ padding: '12px 14px' }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: s.tone || 'var(--white)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ===== CONTROLS ===== */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button className={view === 'board' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setView('board')}><LayoutGrid size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Board</button>
        <button className={view === 'list' ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setView('list')}><List size={14} style={{ verticalAlign: -2, marginRight: 5 }} />List</button>
        <div style={{ flex: 1 }} />
        <button className={dueOnly ? 'btn' : 'btn-ghost'} style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setDueOnly(v => !v)}>
          <CalendarClock size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Due now{dueNow ? ` (${dueNow})` : ''}
        </button>
        <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}
          onClick={() => setShowArchived(v => !v)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        {view === 'board' && (
          <button className="btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}
            onClick={() => setEditStages(v => !v)}>
            {editStages ? <><Check size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Done</> : <><Pencil size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Edit stages</>}
          </button>
        )}
        <button className="btn" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setAdding(a => !a)}>
          <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} />Add lead
        </button>
      </div>

      {/* ===== ADD FORM ===== */}
      {adding && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--orange)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <input autoFocus placeholder="Name *" value={newLead.full_name || ''}
              onChange={e => setNewLead({ ...newLead, full_name: e.target.value })} />
            <input placeholder="Email" type="email" value={newLead.email || ''}
              onChange={e => setNewLead({ ...newLead, email: e.target.value })} />
            <input placeholder="@handle" value={newLead.handle || ''}
              onChange={e => setNewLead({ ...newLead, handle: e.target.value })} />
            <input placeholder="Phone" value={newLead.phone || ''}
              onChange={e => setNewLead({ ...newLead, phone: e.target.value })} />
            <select value={newLead.source || ''} onChange={e => setNewLead({ ...newLead, source: e.target.value })}>
              <option value="">Source…</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input inputMode="decimal" placeholder="Deal size ($)" value={newLead.deal_size || ''}
              onChange={e => setNewLead({ ...newLead, deal_size: e.target.value })} />
            <select value={newLead.stage_id || ''} onChange={e => setNewLead({ ...newLead, stage_id: e.target.value })}>
              <option value="">{stages[0]?.name || 'First stage'}</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 8 }}>
            <input placeholder="Next action (e.g. send the offer)" value={newLead.next_action || ''}
              onChange={e => setNewLead({ ...newLead, next_action: e.target.value })} />
            <input type="date" value={newLead.next_action_date || ''}
              onChange={e => setNewLead({ ...newLead, next_action_date: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={createLead}>Add to pipeline</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setNewLead({}) }}>Cancel</button>
          </div>
        </div>
      )}

      {stages.length === 0 && (
        <div className="card muted">No stages yet — run migration33.sql, then reload.</div>
      )}

      {/* ===== BOARD ===== */}
      {view === 'board' && stages.length > 0 && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {stages.map(stage => {
            const inStage = visible.filter(l => l.stage_id === stage.id)
              .sort((a, b) => {
                // Anything owed today or overdue floats to the top of the column.
                const rank = l => ({ overdue: 0, today: 1, upcoming: 2 }[dueState(l.next_action_date)] ?? 3)
                const d = rank(a) - rank(b)
                if (d !== 0) return d
                return (daysSince(b.stage_changed_at) ?? 0) - (daysSince(a.stage_changed_at) ?? 0)
              })
            const value = inStage.reduce((s, l) => s + (Number(l.deal_size) || 0), 0)
            const isOver = dragOverStage === stage.id
            return (
              <div key={stage.id}
                onDragOver={e => { e.preventDefault(); setDragOverStage(stage.id) }}
                onDragLeave={() => setDragOverStage(s => s === stage.id ? null : s)}
                onDrop={e => { e.preventDefault(); setDragOverStage(null); if (dragId) moveLead(dragId, stage.id); setDragId(null) }}
                style={{
                  minWidth: 236, maxWidth: 236, flexShrink: 0,
                  background: 'var(--coal)', borderRadius: 10, padding: 10,
                  border: isOver ? '2px dashed var(--orange)' : '1px solid var(--line)',
                  transition: 'border-color .15s ease',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5,
                      color: stage.is_won ? 'var(--green)' : stage.is_lost ? 'var(--red)' : 'var(--orange-hot)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{stage.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {inStage.length}{value ? ' · ' + money(value) : ''}
                    </div>
                  </div>
                  {editStages && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn-ghost" style={{ padding: 3 }} title="Move left" onClick={() => moveStage(stage, -1)}><ArrowLeft size={13} /></button>
                      <button className="btn-ghost" style={{ padding: 3 }} title="Move right" onClick={() => moveStage(stage, 1)}><ArrowRight size={13} /></button>
                      <button className="btn-ghost" style={{ padding: 3 }} title="Rename" onClick={() => renameStage(stage)}><Pencil size={13} /></button>
                      <button className="btn-ghost" style={{ padding: 3, color: 'var(--red)' }} title="Delete stage" onClick={() => deleteStage(stage)}><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
                  {inStage.map(l => {
                    const d = daysSince(l.stage_changed_at)
                    return (
                      <div key={l.id}
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => { setDragId(null); setDragOverStage(null) }}
                        onClick={() => openLead(l)}
                        style={{
                          background: 'var(--steel)', borderRadius: 8, padding: '9px 10px',
                          cursor: 'pointer', opacity: dragId === l.id ? .4 : l.archived ? .55 : 1,
                          border: '1px solid var(--line)',
                        }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>
                          {l.full_name || 'Unnamed lead'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
                          <span className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {l.source || l.handle || '—'}
                          </span>
                          {money(l.deal_size) && <span style={{ color: 'var(--green)', fontWeight: 600 }}>{money(l.deal_size)}</span>}
                        </div>
                        <div style={{ fontSize: 10.5, marginTop: 4, color: staleColor(d) }}>
                          {d === null ? '' : d === 0 ? 'Moved today' : `${d}d in stage`}
                          {l.archived && ' · archived'}
                        </div>
                        {l.next_action && (
                          <div style={{
                            marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line)',
                            display: 'flex', alignItems: 'flex-start', gap: 5,
                          }}>
                            <CalendarClock size={11} style={{ marginTop: 2, flexShrink: 0, color: dueColor(l.next_action_date) }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 11, lineHeight: 1.3 }}>{l.next_action}</div>
                              {l.next_action_date && (
                                <div style={{ fontSize: 10, color: dueColor(l.next_action_date), fontWeight: 600 }}>
                                  {dueLabel(l.next_action_date)}
                                </div>
                              )}
                            </div>
                            {['overdue', 'today'].includes(dueState(l.next_action_date)) && (
                              <button className="btn-ghost" title="Mark done"
                                style={{ padding: 1, color: 'var(--green)', flexShrink: 0 }}
                                onClick={e => { e.stopPropagation(); completeAction(l.id) }}>
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {inStage.length === 0 && (
                    <div className="muted" style={{ fontSize: 11.5, padding: '10px 2px', textAlign: 'center' }}>
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {editStages && (
            <button className="btn-ghost" style={{ minWidth: 120, flexShrink: 0, padding: '14px 10px', fontSize: 13 }}
              onClick={addStage}><Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Stage</button>
          )}
        </div>
      )}

      {/* ===== LIST ===== */}
      {view === 'list' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'stage', label: 'Stage' },
                  { key: 'due', label: 'Next action' },
                  { key: 'days', label: 'Days in stage' },
                  { key: 'value', label: 'Deal size' },
                ].map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    style={{ textAlign: 'left', padding: '10px 12px', cursor: 'pointer', fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--muted)' }}>Source</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--muted)' }}>Call</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => {
                const d = daysSince(l.stage_changed_at)
                const stage = stages.find(s => s.id === l.stage_id)
                return (
                  <tr key={l.id} onClick={() => openLead(l)}
                    style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', opacity: l.archived ? .55 : 1 }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      {l.full_name || 'Unnamed lead'}{l.archived && <span className="muted" style={{ fontWeight: 400 }}> · archived</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{stage?.name || '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {l.next_action
                        ? <>
                            <div>{l.next_action}</div>
                            {l.next_action_date && (
                              <div style={{ fontSize: 11, color: dueColor(l.next_action_date), fontWeight: 600 }}>
                                {dueLabel(l.next_action_date)}
                              </div>
                            )}
                          </>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: staleColor(d) }}>{d === null ? '—' : `${d}d`}</td>
                    <td style={{ padding: '10px 12px', color: money(l.deal_size) ? 'var(--green)' : 'var(--muted)' }}>{money(l.deal_size) || '—'}</td>
                    <td style={{ padding: '10px 12px' }} className="muted">{l.source || '—'}</td>
                    <td style={{ padding: '10px 12px' }} className="muted">{l.call_date || '—'}</td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ padding: 20, textAlign: 'center' }}>
                  {dueOnly ? 'Nothing due right now.' : 'No leads yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== WIN-BACK ===== */}
      {(() => {
        const lapsed = profiles.filter(p => p.status === 'paused' || p.status === 'exited')
        if (lapsed.length === 0) return null
        return (
          <div className="card" style={{ marginTop: 20, borderLeft: '3px solid var(--steel)' }}>
            <div className="eyebrow" style={{ fontSize: 10 }}>Win-back</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
              Clients who paused or left. Set someone's status in Clients → Edit and they show up here.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lapsed.map(p => {
                const onBoard = leads.some(l => l.converted_profile_id === p.id && !l.archived)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{p.full_name || p.email || 'Unnamed'}</strong>
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        {' · '}{p.status}
                        {p.status_changed_at ? ` · ${daysSince(p.status_changed_at)}d` : ''}
                      </span>
                    </div>
                    <button className="btn-ghost" style={{ padding: '5px 11px', fontSize: 12 }}
                      disabled={onBoard} onClick={() => winBack(p)}>
                      <Undo2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                      {onBoard ? 'On the board' : 'Add to pipeline'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ===== DETAIL DRAWER ===== */}
      {selectedLead && (
        <>
          <div onClick={() => setSelected(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 40 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)',
            background: 'var(--coal)', borderLeft: '1px solid var(--line)', zIndex: 41,
            overflowY: 'auto', padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ fontSize: 10 }}>Lead</div>
                <h2 style={{ fontSize: 21, margin: '3px 0 0' }}>{selectedLead.full_name || 'Unnamed lead'}</h2>
              </div>
              <button className="btn-ghost" style={{ padding: 5 }} onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div>
                <label className="muted" style={{ fontSize: 11.5 }}>Name</label>
                <input value={detail.full_name} onChange={e => setDetail({ ...detail, full_name: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Stage</label>
                  <select value={detail.stage_id} onChange={e => { setDetail({ ...detail, stage_id: e.target.value }); moveLead(selected, e.target.value) }}>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Deal size ($)</label>
                  <input inputMode="decimal" value={detail.deal_size} onChange={e => setDetail({ ...detail, deal_size: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Email</label>
                  <input type="email" value={detail.email} onChange={e => setDetail({ ...detail, email: e.target.value })} />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Phone</label>
                  <input value={detail.phone} onChange={e => setDetail({ ...detail, phone: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Handle</label>
                  <input placeholder="@" value={detail.handle} onChange={e => setDetail({ ...detail, handle: e.target.value })} />
                </div>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Source</label>
                  <select value={detail.source} onChange={e => setDetail({ ...detail, source: e.target.value })}>
                    <option value="">—</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="muted" style={{ fontSize: 11.5 }}>Call date</label>
                <input type="date" value={detail.call_date} onChange={e => setDetail({ ...detail, call_date: e.target.value })} />
              </div>
              <div style={{
                background: 'var(--steel)', borderRadius: 8, padding: 10,
                borderLeft: `3px solid ${detail.next_action_date ? dueColor(detail.next_action_date) : 'var(--line)'}`,
              }}>
                <label className="muted" style={{ fontSize: 11.5 }}>Next action — what you owe them, and when</label>
                <input placeholder="e.g. send the offer, follow up after his match"
                  value={detail.next_action}
                  onChange={e => setDetail({ ...detail, next_action: e.target.value })} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="date" style={{ maxWidth: 150 }} value={detail.next_action_date}
                    onChange={e => setDetail({ ...detail, next_action_date: e.target.value })} />
                  {[['Today', 0], ['+3d', 3], ['+1wk', 7]].map(([label, n]) => (
                    <button key={label} className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }}
                      onClick={() => setDetail({ ...detail, next_action_date: addDays(n) })}>{label}</button>
                  ))}
                  {detail.next_action_date && (
                    <button className="btn-ghost" style={{ padding: '5px 8px', fontSize: 12, color: 'var(--muted)' }}
                      onClick={() => setDetail({ ...detail, next_action_date: '' })}>Clear</button>
                  )}
                </div>
                {detail.next_action_date && (
                  <div style={{ fontSize: 11.5, marginTop: 6, color: dueColor(detail.next_action_date), fontWeight: 600 }}>
                    {dueLabel(detail.next_action_date)}
                  </div>
                )}
                {selectedLead.next_action && (
                  <button className="btn-ghost" style={{ padding: '6px 11px', fontSize: 12, marginTop: 8, color: 'var(--green)' }}
                    onClick={() => completeAction(selected)}>
                    <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Mark done
                  </button>
                )}
              </div>
              <div>
                <label className="muted" style={{ fontSize: 11.5 }}>Notes (the standing summary — one-offs go in the timeline below)</label>
                <textarea rows={4} value={detail.notes} onChange={e => setDetail({ ...detail, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={saveDetail} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button className="btn-ghost" onClick={() => setArchived(selected, !selectedLead.archived)}>
                  {selectedLead.archived
                    ? <><RotateCcw size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Unarchive</>
                    : <><Archive size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Archive</>}
                </button>
                <button className="btn-ghost" style={{ color: 'var(--red)' }} onClick={() => deleteLead(selected)}>
                  <Trash2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Delete
                </button>
              </div>
            </div>

            {/* ===== CONVERT ===== */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              {selectedLead.converted_profile_id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <UserCheck size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
                  <span>
                    Converted to client
                    {profiles.find(p => p.id === selectedLead.converted_profile_id)
                      ? <> — <strong>{profiles.find(p => p.id === selectedLead.converted_profile_id).full_name || profiles.find(p => p.id === selectedLead.converted_profile_id).email}</strong></>
                      : ' (that client account no longer exists)'}
                  </span>
                </div>
              ) : convertForm ? (
                <div>
                  <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Create their login</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input placeholder="Full name" value={convertForm.full_name}
                      onChange={e => setConvertForm({ ...convertForm, full_name: e.target.value })} />
                    <input type="email" placeholder="Email (this is their login)" value={convertForm.email}
                      onChange={e => setConvertForm({ ...convertForm, email: e.target.value })} />
                    <input placeholder="Temporary password (6+ characters)" value={convertForm.password}
                      onChange={e => setConvertForm({ ...convertForm, password: e.target.value })} />
                    <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>
                      No email gets sent. Give them the password yourself, and they can sign in straight away.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn" onClick={doConvert} disabled={converting}>
                        {converting ? 'Creating…' : 'Create client'}
                      </button>
                      <button className="btn-ghost" onClick={() => setConvertForm(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              ) : (
                <button className="btn" style={{ width: '100%' }}
                  onClick={() => setConvertForm({
                    full_name: selectedLead.full_name || '',
                    email: selectedLead.email || '',
                    password: '',
                  })}>
                  <UserPlus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />Convert to client
                </button>
              )}
            </div>

            {/* ===== TIMELINE ===== */}
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Activity</div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <select value={newNote.kind} style={{ maxWidth: 110 }}
                  onChange={e => setNewNote({ ...newNote, kind: e.target.value })}>
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="dm">DM</option>
                  <option value="email">Email</option>
                </select>
                <input placeholder="What happened?" value={newNote.body}
                  onChange={e => setNewNote({ ...newNote, body: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') addActivity() }} />
                <button className="btn" style={{ padding: '7px 12px' }} onClick={addActivity}>Log</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {activity.map(a => {
                  const meta = KIND_META[a.kind] || KIND_META.note
                  const Icon = meta.icon
                  return (
                    <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}>
                      <Icon size={14} style={{ marginTop: 2, flexShrink: 0, color: a.kind === 'stage_change' ? 'var(--orange-hot)' : 'var(--muted)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: a.kind === 'stage_change' ? 'var(--muted)' : 'var(--white)' }}>{a.body}</div>
                        <div className="muted" style={{ fontSize: 10.5 }}>
                          {new Date(a.occurred_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      {a.kind !== 'stage_change' && (
                        <button className="btn-ghost" style={{ padding: 2, color: 'var(--muted)' }}
                          onClick={() => deleteActivity(a.id)}><X size={12} /></button>
                      )}
                    </div>
                  )
                })}
                {activity.length === 0 && (
                  <div className="muted" style={{ fontSize: 12 }}>Nothing logged yet.</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
