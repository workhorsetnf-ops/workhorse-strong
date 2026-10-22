// Client payment schedule: Paid in full, monthly, or bi-weekly.
// payment_date is the PIF date, or any one payment on the schedule; the next
// payment is worked out from it so it never needs updating by hand.
// All dates are local 'YYYY-MM-DD' strings.
import { addDays, daysBetween } from './dashboard.js'

export const PAYMENT_TYPES = [['pif', 'Paid in full'], ['monthly', 'Monthly'], ['biweekly', 'Bi-weekly']]
export const paymentTypeLabel = t => (PAYMENT_TYPES.find(x => x[0] === t) || [null, ''])[1]

const pad = n => String(n).padStart(2, '0')
// Same day of the month, n months on; the 29th-31st land on the last day of
// shorter months (Jan 31 -> Feb 28 -> Mar 31), always counted from the anchor.
export function addMonths(d, n) {
  const [y, m, day] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(day, last))}`
}

// Next payment on or after today, or null (PIF, no date, no type).
export function nextPayment(type, date, today) {
  if (!date || (type !== 'monthly' && type !== 'biweekly')) return null
  if (type === 'biweekly') {
    const behind = daysBetween(date, today)
    return behind <= 0 ? date : addDays(date, Math.ceil(behind / 14) * 14)
  }
  if (date >= today) return date
  let n = 1
  while (addMonths(date, n) < today) n++
  return addMonths(date, n)
}

const fmt = (d, year = true) => new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) })
const money = a => (a !== null && a !== undefined && a !== '' && Number(a) > 0 ? `$${Number(a).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '')

// One line for client cards and check-ins, e.g.
//   "PIF $1,200 · paid Oct 3, 2026"   "Monthly $200 · next Nov 3 (in 3 days)"
export function paymentSummary(p, today) {
  const type = p?.payment_type
  const amt = money(p?.payment_amount)
  const parts = []
  if (type === 'pif') parts.push([`PIF${amt ? ' ' + amt : ''}`, p.payment_date && `paid ${fmt(p.payment_date)}`].filter(Boolean).join(' · '))
  else if (type === 'monthly' || type === 'biweekly') {
    const next = nextPayment(type, p.payment_date, today)
    const until = next ? daysBetween(today, next) : null
    const when = next ? `next ${fmt(next, false)}${until === 0 ? ' (today)' : until === 1 ? ' (tomorrow)' : until <= 7 ? ` (in ${until} days)` : ''}` : 'no date set'
    parts.push(`${paymentTypeLabel(type)}${amt ? ' ' + amt : ''} · ${when}`)
  } else if (p?.payment_date) parts.push(`Payment ${fmt(p.payment_date)}`)
  if (p?.payment_plan) parts.push(p.payment_plan)
  return parts.join(' · ')
}

// Days until the next scheduled payment (0 = today), or null.
export function daysToPayment(p, today) {
  const next = nextPayment(p?.payment_type, p?.payment_date, today)
  return next ? daysBetween(today, next) : null
}
