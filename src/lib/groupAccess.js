// Group membership access (Update 166 + Update 180), shared by the app and
// the server. Mirrors group_locked() in the database.
const DAY = 864e5

// Does this member have access right now? (Same rule the database uses.)
export function groupAccess(p, now = new Date()) {
  if (!p || p.plan !== 'group') return true
  if (!['active', 'past_due'].includes(p.group_status)) return false
  return !p.group_access_until || new Date(p.group_access_until) > now
}

// Renewal opens in the last 14 days of a Workhorse 90 membership.
export function w90CanRenew(p, now = new Date()) {
  if (p?.group_tier !== 'w90' || !p.group_access_until) return false
  return new Date(p.group_access_until).getTime() - now.getTime() <= 14 * DAY
}

// a member's state for the list: a Workhorse 90 member whose time is up shows as such
export const memberState = (m, now = new Date()) => {
  const s = m.group_status || 'pending'
  return ['active', 'past_due'].includes(s) && !groupAccess({ ...m, plan: 'group' }, now) ? 'expired' : s
}
export const offerLabel = m => m.group_tier === 'w90' ? (m.group_option === 'split' ? 'W90 · 2 payments' : m.group_option === 'full' ? 'W90 · paid in full' : 'Workhorse 90') : '$50/month'

// counts + monthly revenue from the member list. Monthly revenue counts the
// $50/month members only; Workhorse 90 is paid per 90 days, counted on its own.
export function groupStats(members, priceAmount, now = new Date()) {
  const st = members.map(m => memberState(m, now))
  const by = s => st.filter(x => x === s).length
  const paying = by('active') + by('past_due')
  const leaving = members.filter((m, i) => st[i] === 'active' && m.group_tier !== 'w90' && m.group_cancel_at_period_end).length
  const monthlyPaying = members.filter((m, i) => m.group_tier !== 'w90' && ['active', 'past_due'].includes(st[i])).length
  const w90 = members.filter((m, i) => m.group_tier === 'w90' && ['active', 'past_due'].includes(st[i])).length
  return { paying, active: by('active'), pastDue: by('past_due'), pending: by('pending'), ended: by('canceled') + by('expired'), leaving, w90, mrr: priceAmount ? monthlyPaying * priceAmount : null }
}
