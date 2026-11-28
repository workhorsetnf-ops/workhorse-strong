// Clients, CoachRx-style (Update 191): a stats strip (total clients, exercise
// compliance, consult rate, touchpoints), search across names and tags,
// Add client / Manage tags / Export, Active / Archived tabs, and one row per
// client: streak, last consult, exercise due, check-in due, exercise and food
// compliance (7 · 14 · 30 days), tags, and a ⋮ menu.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, ChevronDown, MoreVertical, Flame, Dumbbell, CalendarCheck, X, Tag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { localDateStr, logDate, mondayOf } from '../../lib/weeks'
import { addDays, checkinDueDate } from '../../lib/dashboard'
import { loadProgramSchedule, sessionsOnDate } from '../../lib/conditioning'
import { dateRange, sessionStreak } from '../../lib/clientRx'
import { compliancePct, foodPct, exerciseDue, dueLabel, cleanTags, matchesSearch, toCsv } from '../../lib/coachRoster'
import { countedLogs } from '../../lib/foodlog'
import Avatar from '../Avatar'

const pctColor = p => (p == null ? 'var(--muted)' : p >= 80 ? 'var(--green)' : p >= 50 ? '#E0B23E' : 'var(--red)')
const fmtPct = p => (p == null ? '–' : `${p}%`)

export default function ClientsTable({ clients, onEdit, addPanel, onTagsChanged, coachId }) {
  const today = localDateStr()
  const [tab, setTab] = useState('active')
  const [q, setQ] = useState('')
  const [win, setWin] = useState(30)
  const [stats, setStats] = useState(null)     // clientId -> computed row
  const [contacted, setContacted] = useState(new Set())
  const [consulted, setConsulted] = useState(new Set())
  const [adding, setAdding] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [menuFor, setMenuFor] = useState(null)
  const [tagFor, setTagFor] = useState(null)
  const [tagText, setTagText] = useState('')
  const [tagsLocal, setTagsLocal] = useState({})   // clientId -> tags after edits

  const ids = useMemo(() => clients.map(c => c.id), [clients])
  useEffect(() => {
    if (!ids.length) { setStats({}); return }
    let gone = false
    const since = addDays(today, -60)
    ;(async () => {
      const [logs, meals, checkins, bookings, msgs, moves, schedules] = await Promise.all([
        supabase.from('workout_logs').select('client_id, logged_date, logged_at, session_track').in('client_id', ids).gte('logged_at', since + 'T00:00:00').limit(50000),
        supabase.from('meal_logs').select('client_id, logged_on, meal').in('client_id', ids).gte('logged_on', addDays(today, -30)).limit(50000),
        supabase.from('checkins').select('client_id, submitted_at').in('client_id', ids).order('submitted_at', { ascending: false }).limit(5000),
        supabase.from('bookings').select('client_id, starts_at, status').in('client_id', ids).gte('starts_at', addDays(today, -365) + 'T00:00:00'),
        supabase.from('messages').select('recipient_id, created_at').in('recipient_id', ids).gte('created_at', mondayOf(today) + 'T00:00:00'),
        supabase.from('session_moves').select('*').in('client_id', ids),
        Promise.all(ids.map(id => loadProgramSchedule(supabase, id).catch(() => null))),
      ])
      if (gone) return
      const out = {}
      const dates60 = dateRange(today, 60)
      ids.forEach((id, i) => {
        const c = clients[i]
        const logged = new Set((logs.data || []).filter(l => l.client_id === id && l.session_track !== 'lifestyle').map(logDate).filter(Boolean))
        const food = new Set(countedLogs((meals.data || []).filter(m => m.client_id === id)).map(m => m.logged_on))
        const sched = schedules[i]
        const mv = (moves.data || []).filter(m => m.client_id === id)
        const counts = {}
        if (sched) for (const d of [...dates60, ...dateRange(addDays(today, 28), 28)]) counts[d] = sessionsOnDate(d, sched, mv).filter(s => (s.track || 'exercise') !== 'lifestyle').length
        const last = (checkins.data || []).find(x => x.client_id === id)
        const due = checkinDueDate({ checkinDay: c.checkin_day, frequency: c.checkin_frequency, lastCheckin: last ? localDateStr(new Date(last.submitted_at)) : null, today, startDate: c.start_date })
        const past = (bookings.data || []).filter(b => b.client_id === id && b.status !== 'cancelled' && new Date(b.starts_at) <= new Date()).sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        out[id] = {
          streak: sched ? sessionStreak(dates60, today, counts, logged) : 0,
          lastConsult: past[0]?.starts_at || null,
          exDue: sched ? exerciseDue(counts, logged, today) : null,
          hasProgram: !!sched,
          checkinDue: due || null,
          ex: [7, 14, 30].map(n => (sched ? compliancePct(counts, logged, today, n) : null)),
          food: [7, 14, 30].map(n => foodPct(food, today, n, c.created_at ? localDateStr(new Date(c.created_at)) : null)),
        }
      })
      setStats(out)
      setContacted(new Set((msgs.data || []).map(m => m.recipient_id)))
      setConsulted(new Set((bookings.data || []).filter(b => b.status !== 'cancelled' && b.starts_at >= addDays(today, -30) + 'T00:00:00' && new Date(b.starts_at) <= new Date()).map(b => b.client_id)))
    })()
    return () => { gone = true }
  }, [ids.join(',')])

  const tagsOf = c => tagsLocal[c.id] ?? c.tags ?? []
  const allTags = cleanTags(clients.flatMap(tagsOf))
  const current = clients.filter(c => (c.status || 'active') !== 'exited')
  const archived = clients.filter(c => (c.status || 'active') === 'exited')
  const rows = (tab === 'active' ? current : archived).filter(c => matchesSearch({ ...c, tags: tagsOf(c) }, q))
  const wi = { 7: 0, 14: 1, 30: 2 }[win]
  const exVals = current.map(c => stats?.[c.id]?.ex[wi]).filter(v => v != null)
  const header = {
    total: current.length,
    compliance: exVals.length ? Math.round(exVals.reduce((a, b) => a + b, 0) / exVals.length) : null,
    consult: current.length ? Math.round((current.filter(c => consulted.has(c.id)).length / current.length) * 100) : null,
    touch: current.length ? Math.round((current.filter(c => contacted.has(c.id)).length / current.length) * 100) : null,
  }

  async function saveTags(c, tags) {
    const next = cleanTags(tags)
    setTagsLocal(m => ({ ...m, [c.id]: next }))
    const { error } = await supabase.from('profiles').update({ tags: next }).eq('id', c.id)
    if (error) { alert(/tags/.test(error.message) ? 'Run the Update 191 migration in Supabase to use tags.' : 'Couldn’t save tags: ' + error.message); setTagsLocal(m => { const n = { ...m }; delete n[c.id]; return n }) }
    else onTagsChanged?.()
  }
  async function renameTag(from, to) {
    for (const c of clients.filter(x => tagsOf(x).includes(from))) await saveTags(c, tagsOf(c).map(t => (t === from ? to : t)).filter(Boolean))
  }
  function exportCsv() {
    const head = ['Name', 'Email', 'Status', 'Streak', 'Last consult', 'Exercise due', 'Check-in due', 'Exercise 7d', 'Exercise 14d', 'Exercise 30d', 'Food log 7d', 'Food log 14d', 'Food log 30d', 'Tags']
    const body = rows.map(c => {
      const s = stats?.[c.id] || {}
      return [c.full_name, c.email, c.status || 'active', s.streak, s.lastConsult ? localDateStr(new Date(s.lastConsult)) : '', s.exDue?.date || '', s.checkinDue || '', ...(s.ex || []), ...(s.food || []), tagsOf(c).join('; ')]
    })
    const blob = new Blob([toCsv([head, ...body])], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `clients-${today}.csv`; a.click()
  }

  return (
    <div>
      <div className="rx-stats">
        <div><div className="num" data-stat="total">{header.total}</div><div className="lbl">Total clients</div></div>
        <div>
          <div className="num" data-stat="compliance">{fmtPct(header.compliance)}</div><div className="lbl">Compliance</div>
          <select aria-label="Compliance window" value={win} onChange={e => setWin(Number(e.target.value))} style={{ width: 'auto', marginTop: 8, fontSize: 13, padding: '5px 10px' }}>
            <option value={7}>Exercise: 7 Day</option><option value={14}>Exercise: 14 Day</option><option value={30}>Exercise: 30 Day</option>
          </select>
        </div>
        <div><div className="num" data-stat="consult">{fmtPct(header.consult)}</div><div className="lbl">Consult rate</div><div className="muted" style={{ fontSize: 12 }}>had a call in 30 days</div></div>
        <div><div className="num" data-stat="touch">{fmtPct(header.touch)}</div><div className="lbl">Touchpoints</div><div className="muted" style={{ fontSize: 12 }}>messaged this week</div></div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ flex: 1, minWidth: 240, position: 'relative', display: 'block' }}>
          <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input aria-label="Search clients and tags" placeholder="Search clients and tags…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 40 }} />
        </label>
        <button className="btn" onClick={() => setAdding(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={16} /> Add client <ChevronDown size={15} /></button>
        <button className="btn-ghost" onClick={() => setTagsOpen(o => !o)}>Manage tags</button>
        <button className="btn-ghost" onClick={exportCsv}>Export</button>
      </div>
      {adding && <div style={{ marginBottom: 16 }}>{addPanel}</div>}

      {tagsOpen && (
        <div className="card" style={{ marginBottom: 16 }} aria-label="Manage tags">
          <strong style={{ fontSize: 16 }}>Tags</strong>
          {allTags.length === 0 && <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>No tags yet. Use “Add to tag” on any client.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {allTags.map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <span style={{ flex: 1 }}><Tag size={14} /> {t} <span className="muted">({clients.filter(c => tagsOf(c).includes(t)).length})</span></span>
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5 }} onClick={() => { const n = prompt('Rename tag', t); if (n && n.trim() && n.trim() !== t) renameTag(t, n.trim()) }}>Rename</button>
                <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12.5, color: 'var(--red)' }} onClick={() => { if (confirm(`Remove “${t}” from every client?`)) renameTag(t, '') }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rx-tabs" role="tablist" style={{ marginBottom: 0, borderBottom: 'none' }}>
        <button role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')} style={{ fontSize: 16 }}>Active <span className="rx-count">{current.length}</span></button>
        <button role="tab" aria-selected={tab === 'archived'} onClick={() => setTab('archived')} style={{ fontSize: 16 }}>Archived <span className="rx-count">{archived.length}</span></button>
      </div>

      <div className="rx-table-wrap">
        <table className="rx-table">
          <thead>
            <tr><th style={{ width: 56 }} /><th>Name</th><th>Exercise due</th><th>Check-in due</th><th>Exercise compliance</th><th>Food log compliance</th><th>Tags</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 22 }}>{clients.length ? 'No matches.' : 'No clients yet.'}</td></tr>}
            {rows.map(c => {
              const s = stats?.[c.id]
              const tags = tagsOf(c)
              const ciLate = s?.checkinDue && s.checkinDue < today
              return (
                <tr key={c.id} data-client={c.full_name || c.email}>
                  <td><Link to={`/coach/day/${c.id}`}><Avatar url={c.avatar_url} name={c.full_name} size={44} ring="2px solid var(--orange)" /></Link></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div>
                        <Link to={`/coach/day/${c.id}`} style={{ color: 'inherit', fontWeight: 700, fontSize: 15, textDecoration: 'none', whiteSpace: 'nowrap' }}>{c.full_name || <span style={{ color: 'var(--orange-hot)' }}>Needs a name</span>}</Link>
                        <div className="muted" style={{ fontSize: 12.5 }}>Last consult:<br />{s?.lastConsult ? new Date(s.lastConsult).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</div>
                      </div>
                      <span title="Current streak" data-streak style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--steel)', borderRadius: 999, padding: '3px 9px', fontSize: 13, fontWeight: 700 }}><Flame size={13} color="var(--orange-hot)" /> {s ? s.streak : '–'}</span>
                    </div>
                  </td>
                  <td data-col="exdue">{!s ? '…' : !s.hasProgram ? <span className="rx-due none">No program</span> : !s.exDue ? <span className="rx-due none">Nothing scheduled</span>
                    : <span className={'rx-due ' + (s.exDue.late ? 'late' : 'ok')}><Dumbbell size={13} /> {dueLabel(s.exDue, today)}</span>}</td>
                  <td>{!s ? '…' : !s.checkinDue ? <span className="rx-due none">Not set</span>
                    : <span className={'rx-due ' + (ciLate ? 'late' : s.checkinDue === today ? 'wait' : 'ok')}><CalendarCheck size={13} /> {dueLabel({ date: s.checkinDue, late: ciLate }, today)}</span>}</td>
                  <td data-col="ex" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{s ? s.ex.map((p, i) => <span key={i} style={{ color: pctColor(p) }}>{i ? ' · ' : ''}{fmtPct(p)}</span>) : '…'}</td>
                  <td data-col="food" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{s ? s.food.map((p, i) => <span key={i} style={{ color: pctColor(p) }}>{i ? ' · ' : ''}{fmtPct(p)}</span>) : '…'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', maxWidth: 240 }}>
                      {tags.map(t => (
                        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,85,0,.14)', color: 'var(--orange-hot)', borderRadius: 999, padding: '3px 9px', fontSize: 12.5, fontWeight: 700 }}>
                          {t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => saveTags(c, tags.filter(x => x !== t))} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', display: 'flex' }}><X size={12} /></button>
                        </span>
                      ))}
                      {tagFor === c.id ? (
                        <form onSubmit={e => { e.preventDefault(); if (tagText.trim()) saveTags(c, [...tags, tagText]); setTagFor(null); setTagText('') }} style={{ display: 'flex', gap: 4 }}>
                          <input autoFocus list="ws-tags" aria-label="New tag" value={tagText} onChange={e => setTagText(e.target.value)} onBlur={() => setTimeout(() => setTagFor(null), 150)} style={{ width: 120, padding: '4px 8px', fontSize: 13 }} />
                        </form>
                      ) : (
                        <button type="button" className="btn-ghost" onClick={() => { setTagFor(c.id); setTagText('') }} style={{ padding: '4px 10px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add to tag</button>
                      )}
                    </div>
                  </td>
                  <td style={{ position: 'relative', width: 40 }}>
                    <button type="button" aria-label="Client options" className="btn-ghost" style={{ padding: 6, display: 'flex', border: 'none' }} onClick={() => setMenuFor(m => (m === c.id ? null : c.id))}><MoreVertical size={18} /></button>
                    {menuFor === c.id && (
                      <div className="dd-panel" style={{ width: 200, top: 40 }} role="menu">
                        <Link className="dd-row" to={`/coach/day/${c.id}`}>Day view</Link>
                        <Link className="dd-row" to={`/coach/logs/${c.id}`}>View logs</Link>
                        <Link className="dd-row" to="/coach/messages">Message</Link>
                        <button type="button" className="dd-row" onClick={() => { setMenuFor(null); onEdit(c) }}>Edit details…</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <datalist id="ws-tags">{allTags.map(t => <option key={t} value={t} />)}</datalist>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Compliance columns are the last 7 · 14 · 30 days. Exercise = scheduled sessions trained; food log = days with food logged.</p>
    </div>
  )
}
