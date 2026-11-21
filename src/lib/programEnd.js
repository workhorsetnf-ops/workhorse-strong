// When does each client's program run out? (Update 186)
//
// Used by Coach Home ("Programs ending soon") and the coach's morning push,
// so Anthony hears about it while there's still time to build the next block.
//
// Program weeks run Monday to Sunday (Update 162), so a program ends on the
// Sunday of its last week.
//   Auto weeks:   week 1 is the week of start_date, so the end date is exact.
//   Manual weeks: the week only moves when the coach moves it, so the end date
//                 assumes he keeps moving it once a week from where it is now.
//                 That estimate slides if the week isn't moved, so reminders for
//                 manual clients are keyed on the block/week they're on instead
//                 of the date: moving them on is what makes the next one fire.
import { daysBetween, mondayOf, localDateStr } from './weeks.js'

// Reminders go out at these points before the last day, then once when it's over.
export const END_ALERT_DAYS = [14, 7]
export const SHOW_WITHIN_DAYS = 14

export function addDaysStr(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  return localDateStr(new Date(y, m - 1, d + n))
}
const ymd = s => (s ? String(s).slice(0, 10) : null)
const between = (a, b) => daysBetween(a, new Date(b + 'T00:00:00')) // b - a, whole days

// blocks: this program's blocks in order. today: 'YYYY-MM-DD'.
// Returns null when there's nothing to work out (no blocks, auto with no start).
export function programEnd(assignment, blocks, today) {
  if (!assignment) return null
  const list = (blocks || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (!list.length) return null
  const totalWeeks = list.reduce((s, b) => s + (Number(b.weeks) || 4), 0)
  const start = ymd(assignment.start_date)

  let endDate, estimate = false, key
  if (assignment.week_mode === 'auto') {
    if (!start) return null
    endDate = addDaysStr(mondayOf(start), totalWeeks * 7 - 1)
    key = endDate
  } else {
    // weeks still to go after this one, from the coach's current block/week
    let idx = list.findIndex(b => b.id === assignment.current_block_id)
    if (idx < 0) idx = 0
    const cur = list[idx]
    const curWeeks = Number(cur.weeks) || 4
    const week = Math.min(Math.max(1, Number(assignment.current_week) || 1), curWeeks)
    const after = (curWeeks - week) + list.slice(idx + 1).reduce((s, b) => s + (Number(b.weeks) || 4), 0)
    // a start date in the future: nothing has run yet, count from that week
    const anchor = start && start > today ? mondayOf(start) : mondayOf(today)
    endDate = addDaysStr(anchor, 6 + after * 7)
    estimate = true
    key = `${cur.id}:w${week}:of${totalWeeks}`
  }
  const daysLeft = between(today, endDate)
  return { endDate, daysLeft, totalWeeks, estimate, key }
}

// Which reminder (if any) this many days out falls into: 14, 7, or 0 (= over).
// Missed a day? It still fires, just later, because it's "at or under".
export function alertBucket(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return null
  if (daysLeft < 0) return 0
  const hits = END_ALERT_DAYS.filter(d => daysLeft <= d)
  return hits.length ? Math.min(...hits) : null
}

export function whenText(daysLeft) {
  if (daysLeft < 0) return `ended ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago`
  if (daysLeft === 0) return 'ends today'
  if (daysLeft === 1) return 'ends tomorrow'
  if (daysLeft < 7) return `ends in ${daysLeft} days`
  const w = Math.round(daysLeft / 7)
  return daysLeft % 7 === 0 ? `ends in ${w} week${w === 1 ? '' : 's'}` : `ends in ${daysLeft} days`
}

// Every client whose program ends within `within` days (or already has),
// soonest first. rows: [{ client, assignment, program, blocks }]
export function endingSoon(rows, today, within = SHOW_WITHIN_DAYS) {
  return (rows || [])
    .map(r => ({ ...r, end: programEnd(r.assignment, r.blocks, today) }))
    .filter(r => r.end && r.end.daysLeft <= within)
    .sort((a, b) => a.end.daysLeft - b.end.daysLeft)
}

const first = name => String(name || '').trim().split(/\s+/)[0] || 'Client'

// The coach's push for this morning, plus the rows to claim so each
// client/end-date/bucket only ever sends once.
// sent: Set of "assignmentId|endKey|bucket" already sent.
export function programEndPush(coachId, ending, sent) {
  const fresh = []
  for (const r of ending) {
    const b = alertBucket(r.end.daysLeft)
    if (b === null) continue
    const k = x => `${r.assignment.id}|${r.end.key}|${x}`
    if (sent.has(k(b))) continue
    // a later reminder already went out for this same end -> don't go backwards
    if (END_ALERT_DAYS.concat(0).filter(x => x < b).some(x => sent.has(k(x)))) continue
    fresh.push({ ...r, bucket: b })
  }
  if (!fresh.length) return null
  const over = fresh.filter(r => r.end.daysLeft < 0)
  const soon = fresh.filter(r => r.end.daysLeft >= 0)
  const list = fresh.slice(0, 4).map(r => `${first(r.client.full_name)} (${whenText(r.end.daysLeft).replace(/^ends /, '')})`).join(', ') + (fresh.length > 4 ? '…' : '')
  const title = fresh.length === 1
    ? `🏗️ ${first(fresh[0].client.full_name)}'s program ${whenText(fresh[0].end.daysLeft)}`
    : over.length && !soon.length ? `🏗️ ${fresh.length} programs have run out` : `🏗️ ${fresh.length} programs ending soon`
  const body = fresh.length === 1
    ? `${fresh[0].program?.name || 'Their program'} · last day ${fresh[0].end.endDate}. Time to build the next block.`
    : `${list}. Time to build their next blocks.`
  return {
    msg: { user_id: coachId, title, body, url: '/coach', tag: 'program-end' },
    claims: fresh.map(r => ({ assignment_id: r.assignment.id, end_key: r.end.key, bucket: r.bucket })),
  }
}

// Fetch what endingSoon() needs. Works with the app's client (coach RLS) or
// the server's service-role client. Paused/exited and group-plan clients are
// left out: they aren't waiting on a program from Anthony.
export async function loadEnding(sb, today, within = SHOW_WITHIN_DAYS) {
  const { data: asg, error } = await sb.from('program_assignments').select('*')
  if (error || !asg?.length) return []
  const clientIds = [...new Set(asg.map(a => a.client_id))]
  const programIds = [...new Set(asg.map(a => a.program_id))]
  const [{ data: people }, { data: blocks }, { data: programs }] = await Promise.all([
    sb.from('profiles').select('id, full_name, status, plan, role').in('id', clientIds),
    sb.from('program_blocks').select('id, program_id, name, weeks, position').in('program_id', programIds),
    sb.from('programs').select('id, name').in('id', programIds),
  ])
  const who = Object.fromEntries((people || []).map(p => [p.id, p]))
  const prog = Object.fromEntries((programs || []).map(p => [p.id, p]))
  const rows = asg
    .map(a => ({ assignment: a, client: who[a.client_id], program: prog[a.program_id], blocks: (blocks || []).filter(b => b.program_id === a.program_id) }))
    .filter(r => r.client && r.client.role === 'client' && !['paused', 'exited'].includes(r.client.status) && r.client.plan !== 'group')
  return endingSoon(rows, today, within)
}
