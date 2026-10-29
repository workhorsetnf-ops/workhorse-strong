// Shows, TV tapings and travel a client has coming up, and what that means
// for training on a given day. Dates are local 'YYYY-MM-DD' strings.

export const EVENT_KINDS = {
  show: { label: 'Show / match', icon: '🎤' },
  tv: { label: 'TV taping', icon: '📺' },
  travel: { label: 'Travel', icon: '✈️' },
  other: { label: 'Other', icon: '📌' },
}
const isBooking = e => e.kind === 'show' || e.kind === 'tv'

export function eventsOn(events, date) {
  return (events || []).filter(e => e.start_date <= date && e.end_date >= date)
}

export function eventIcons(events, date) {
  return [...new Set(eventsOn(events, date).map(e => EVENT_KINDS[e.kind]?.icon || '📌'))].join('')
}

// One piece of training advice for `today`, most important first:
// show today > travel today > show tomorrow > flying tomorrow > day after a show.
// Returns { tone: 'show'|'travel'|'light', title, body, canMove } or null.
export function eventAdvice(events, today, addDays) {
  const on = d => eventsOn(events, d)
  const name = e => e.title || EVENT_KINDS[e.kind]?.label || 'event'
  const t = on(today), tm = on(addDays(today, 1)), y = on(addDays(today, -1))
  const showToday = t.find(isBooking)
  if (showToday) return { tone: 'show', title: `${EVENT_KINDS[showToday.kind].icon} ${name(showToday)} today`, body: 'No heavy session today. 10 minutes of activation and mobility before the show is plenty. Move today’s lift to another day below if it’s on today.', canMove: true }
  const travelToday = t.find(e => e.kind === 'travel')
  if (travelToday) return { tone: 'travel', title: `✈️ Travel day${travelToday.location ? `: ${travelToday.location}` : ''}`, body: 'Use ✈️ Away mode for a hotel or bodyweight session, or move today’s session to a day you’re home.', canMove: true }
  const showTomorrow = tm.find(isBooking)
  if (showTomorrow) return { tone: 'light', title: `${EVENT_KINDS[showTomorrow.kind].icon} ${name(showTomorrow)} tomorrow`, body: 'Keep today light: leave 1 extra rep in the tank (RIR +1) and skip anything that wrecks your legs.', canMove: false }
  const travelTomorrow = tm.find(e => e.kind === 'travel') && !t.some(e => e.kind === 'travel')
  if (travelTomorrow) return { tone: 'light', title: '✈️ Traveling tomorrow', body: 'Get today’s session in. It’s the one you can control.', canMove: false }
  const showYesterday = y.find(isBooking)
  if (showYesterday) return { tone: 'light', title: 'Day after the show', body: 'Bumps add up. Longer warm-up and an extra rep in the tank (RIR +1) today.', canMove: false }
  return null
}

// Coach view: events touching the next `days` days, soonest first.
export function upcoming(events, today, addDays, days = 7) {
  const end = addDays(today, days - 1)
  return (events || []).filter(e => e.end_date >= today && e.start_date <= end)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
}
