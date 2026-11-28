// Coach roster numbers (Update 191): the Business overview and the Clients
// table, CoachRx-style. Pure functions over rows already fetched.
import { addDays } from './dashboard'
import { dateRange } from './clientRx'

const monthKey = d => String(d || '').slice(0, 7)

export function businessStats({ stages = [], leads = [], clients = [], contracts = [], today }) {
  const wonId = stages.find(s => s.is_won)?.id
  const lostId = stages.find(s => s.is_lost)?.id
  const open = leads.filter(l => !l.archived && l.stage_id !== wonId && l.stage_id !== lostId)
  const thisMonth = monthKey(today)
  const status = c => c.status || 'active'
  return {
    activeClients: clients.filter(c => status(c) === 'active').length,
    pausedClients: clients.filter(c => status(c) === 'paused').length,
    newThisMonth: clients.filter(c => monthKey(c.created_at) === thisMonth && status(c) !== 'exited').length,
    exitedThisMonth: clients.filter(c => status(c) === 'exited' && monthKey(c.status_changed_at) === thisMonth).length,
    openLeads: open.length,
    pipelineValue: open.reduce((s, l) => s + (Number(l.deal_size) || 0), 0),
    wonThisMonth: leads.filter(l => l.stage_id === wonId && monthKey(l.stage_changed_at) === thisMonth).length,
    followUpsDue: leads.filter(l => !l.archived && l.next_action_date && l.next_action_date <= today).length,
    contractsOut: contracts.filter(c => c.status === 'sent').length,
    contractsSigned: contracts.filter(c => c.status === 'signed' && monthKey(c.signed_at) === thisMonth).length,
  }
}

// Exercise compliance over the last `days`: scheduled sessions with a workout
// logged that day ÷ scheduled sessions. Today counts only once it's logged.
// null when nothing was scheduled (shown as "–").
export function compliancePct(countsByDate, logged, today, days) {
  let due = 0, hit = 0
  for (const d of dateRange(today, days)) {
    const n = countsByDate[d] || 0
    if (!n) continue
    if (d === today && !logged.has(d)) continue
    due++
    if (logged.has(d)) hit++
  }
  return due ? Math.round((hit / due) * 100) : null
}

// Food-log compliance: days with any food logged ÷ days in the window
// (today counts only once something's logged). null for a brand-new client.
export function foodPct(foodDates, today, days, startDate) {
  let n = 0, hit = 0
  for (const d of dateRange(today, days)) {
    if (startDate && d < startDate) continue
    if (d === today && !foodDates.has(d)) continue
    n++
    if (foodDates.has(d)) hit++
  }
  return n ? Math.round((hit / n) * 100) : null
}

// CoachRx's "Exercise Due" pill: the oldest scheduled-but-unlogged session in
// the last 7 days (red, "Last Tuesday"), else the next scheduled one (green).
export function exerciseDue(countsByDate, logged, today) {
  for (let i = 7; i >= 1; i--) {
    const d = addDays(today, -i)
    if ((countsByDate[d] || 0) > 0 && !logged.has(d)) return { date: d, late: true }
  }
  for (let i = 0; i <= 28; i++) {
    const d = addDays(today, i)
    if ((countsByDate[d] || 0) > 0 && !logged.has(d)) return { date: d, late: false }
  }
  return null
}

// "Last Tuesday" / "Today" / "Sun Dec 13th"
export function dueLabel(due, today) {
  if (!due) return ''
  const dt = new Date(due.date + 'T00:00:00')
  if (due.date === today) return 'Today'
  if (due.late) return due.date === addDays(today, -1) ? 'Yesterday' : 'Last ' + dt.toLocaleDateString('en-US', { weekday: 'long' })
  const day = dt.getDate()
  const sfx = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${dt.toLocaleDateString('en-US', { weekday: 'short' })} ${dt.toLocaleDateString('en-US', { month: 'short' })} ${day}${sfx}`
}

// Tags: trimmed, de-duplicated (case-insensitive), sorted.
export function cleanTags(list) {
  const seen = new Map()
  for (const t of list || []) {
    const v = String(t || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

// Search box matches name, email or any tag.
export function matchesSearch(c, q) {
  const s = String(q || '').trim().toLowerCase()
  if (!s) return true
  return [c.full_name, c.email, ...(c.tags || [])].some(v => String(v || '').toLowerCase().includes(s))
}

// CSV for the Export button.
export function toCsv(rows) {
  const esc = v => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map(r => r.map(esc).join(',')).join('\n')
}

// Weekly Check-Ins feed card, CoachRx-style: ratings as bars, the rest as Q&A.
// Built-in 1-10 averages first, then the client's custom form answers (a plain
// number up to 10 is treated as a 1-10 slider).
const ten = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
export function checkinCard(c) {
  const bars = []
  const add = (label, value, max) => { if (value != null) bars.push({ label, value: Math.round(value * 10) / 10, max }) }
  add('Energy this week', ten(c.energy), 10)
  add('Hunger this week', ten(c.hunger), 10)
  add('Stress this week', ten(c.stress), 10)
  add('Digestion this week', ten(c.digestion), 10)
  if (ten(c.adherence) != null) add('On-plan days', Math.round(Number(c.adherence) * 100), 100)
  if (ten(c.sleep_avg) != null) add('Sleep (avg hours)', Number(c.sleep_avg), 9)
  const qa = []
  for (const r of Array.isArray(c.form_responses) ? c.form_responses : []) {
    const label = String(r?.label || '').trim()
    const value = String(r?.value ?? '').trim()
    if (!label || !value) continue
    if (/^\d+(\.\d+)?$/.test(value) && Number(value) <= 10 && !bars.some(b => b.label.toLowerCase() === label.toLowerCase())) bars.push({ label, value: Number(value), max: 10 })
    else qa.push({ label, value })
  }
  if (c.notes && String(c.notes).trim()) qa.push({ label: 'Notes', value: String(c.notes).trim() })
  const facts = [c.weight ? `${c.weight} lb` : null, c.waist ? `${c.waist}" waist` : null, c.steps ? `${Math.round(c.steps).toLocaleString()} steps/day` : null].filter(Boolean)
  return { bars, qa, facts }
}
