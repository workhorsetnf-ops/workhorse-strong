// Update 158: making a due check-in impossible to miss.
// Pure helpers shared by the client app (pinned banner, full-screen card, icon
// badge) and the coach's "Check-in texts" card. Same due-date rule as
// everything else (checkinDueDate), so the banner, the pushes and the coach's
// list always agree on who is due.
import { checkinDueDate, daysBetween } from './dashboard.js'

// state: 'due' (today is the day), 'late' (past it, not submitted),
//        'upcoming' (not yet), 'first' (never checked in and no day/start set).
export function weeklyCheckin({ checkinDay, frequency, startDate, lastCheckin, today }) {
  const dueDate = checkinDueDate({ checkinDay, frequency, lastCheckin, today, startDate })
  if (!dueDate) return { state: 'first', lateDays: 0, dueDate: null, open: true }
  const late = daysBetween(dueDate, today)
  if (late < 0) return { state: 'upcoming', lateDays: 0, dueDate, open: false }
  if (late === 0) return { state: 'due', lateDays: 0, dueDate, open: true }
  return { state: 'late', lateDays: late, dueDate, open: true }
}

export function nagText(s) {
  if (!s?.open) return null
  if (s.state === 'late') return { title: `Check-in is ${s.lateDays} day${s.lateDays === 1 ? '' : 's'} late`, tone: 'red' }
  if (s.state === 'first') return { title: 'Your first check-in is due', tone: 'orange' }
  return { title: 'Your check-in is due today', tone: 'orange' }
}

// Update 159: the coach's per-client lock. Kicks in once the check-in is a day
// or more late; never for a client with no schedule.
export function isLocked(lockOn, s) {
  return !!lockOn && s?.state === 'late' && s.lateDays >= 1
}
export const LOCKED_PATHS = ['/app/training', '/app/nutrition', '/app/progress']
export const lockedPath = path => LOCKED_PATHS.some(p => path === p || path.startsWith(p + '/'))

// The full-screen card comes back every time the app is opened (or brought
// back to the front) until the check-in is in, but not more than once an hour
// so it doesn't get in the way while they're using the app.
export const TAKEOVER_GAP_MS = 60 * 60 * 1000
export function showTakeover(s, dismissedAt, now = Date.now()) {
  if (!s?.open) return false
  if (!dismissedAt) return true
  return now - Number(dismissedAt) >= TAKEOVER_GAP_MS
}

// Number on the home-screen icon: one for an open check-in, plus unread
// messages and film comments.
export function badgeCount({ checkinOpen, unreadMessages = 0, filmUnread = false }) {
  return (checkinOpen ? 1 : 0) + Math.max(0, Number(unreadMessages) || 0) + (filmUnread ? 1 : 0)
}

// ---------- coach: one-tap texts ----------

// "(555) 123-4567" -> "+15551234567". US numbers assumed when there's no country
// code. Returns null when it can't be a phone number.
export function smsNumber(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const digits = s.replace(/\D/g, '')
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// Opens Messages with the number and text filled in. iPhones want "&body=",
// everything else "?body=".
export function smsHref(number, body, userAgent = '') {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent))
  return `sms:${number}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`
}

const firstName = n => String(n || '').trim().split(/\s+/)[0] || ''

export const DEFAULT_TEXTS = {
  morning: "Morning {name}! Your check-in is due today. Knock it out in the app 💪 workhorse-strong.vercel.app/app/checkin",
  evening: "{name}, last call on your check-in today. Takes a few minutes, get it in before bed 💪 workhorse-strong.vercel.app/app/checkin",
  late: "{name}, your check-in is {late} late. Get it in today so I can review your week 💪 workhorse-strong.vercel.app/app/checkin",
}

export function fillText(template, { name, lateDays = 0 }) {
  const late = `${lateDays} day${lateDays === 1 ? '' : 's'}`
  return String(template || '')
    .replace(/\{name\}/g, firstName(name) || 'Hey')
    .replace(/\{late\}/g, late)
    .replace(/\s+([,.!])/g, '$1')
}

// Morning texts until 3pm, "last call" after.
export function textSlot(now = new Date()) { return now.getHours() < 15 ? 'morning' : 'evening' }

// Who goes on today's list: active clients whose check-in is due today or up
// to a week late, with a schedule (no day and no start date = nothing to chase).
// lastByClient: { id: 'YYYY-MM-DD' }  sent: Set of `${client_id}|${slot}` for today
export function textList(clients, lastByClient, today, sent = new Set(), slot = 'morning', maxLate = 7) {
  return (clients || [])
    .filter(c => c.status !== 'paused' && c.status !== 'exited')
    .map(c => {
      const s = weeklyCheckin({ checkinDay: c.checkin_day, frequency: c.checkin_frequency, startDate: c.start_date, lastCheckin: lastByClient[c.id] || null, today })
      return { client: c, ...s, number: smsNumber(c.phone), texted: sent.has(`${c.id}|${slot}`) }
    })
    .filter(r => r.state === 'due' || (r.state === 'late' && r.lateDays <= maxLate))
    .sort((a, b) => (a.texted - b.texted) || (b.lateDays - a.lateDays) || String(a.client.full_name || '').localeCompare(String(b.client.full_name || '')))
}

export function messageFor(row, slot, texts = DEFAULT_TEXTS) {
  const t = { ...DEFAULT_TEXTS, ...Object.fromEntries(Object.entries(texts || {}).filter(([, v]) => v)) }
  const tpl = row.state === 'late' ? t.late : slot === 'evening' ? t.evening : t.morning
  return fillText(tpl, { name: row.client.full_name, lateDays: row.lateDays })
}
