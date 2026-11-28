// Coach navigation, CoachRx-style (Update 191): a top bar of sections, each
// with its own left-hand menu. Pure data + helpers so it can be tested.
// `badge` names a key from loadCoachBadges(); `head` = head coach only.

export const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard', to: '/coach', items: [] },
  {
    key: 'clients', label: 'Clients', to: '/coach/clients',
    items: [
      { to: '/coach/clients', label: 'All clients', icon: 'Users' },
      { to: '/coach/checkins', label: 'Check-ins', icon: 'CalendarCheck', badge: 'checkins' },
      { to: '/coach/messages', label: 'Messages', icon: 'MessageCircle', badge: 'messages' },
      { to: '/coach/form-checks', label: 'Form checks', icon: 'Video', badge: 'formChecks' },
      { to: '/coach/calls', label: 'Calls', icon: 'Webcam' },
      { to: '/coach/group', label: 'Group', icon: 'UsersRound' },
      { to: '/coach/community', label: 'Community', icon: 'Users2', badge: 'community' },
      { to: '/coach/challenges', label: 'Challenges', icon: 'Trophy' },
      { to: '/coach/scorecard', label: 'Scorecard', icon: 'Gauge' },
      { to: '/coach/texts', label: 'Text blast', icon: 'MessageSquareText' },
      { to: '/coach/alerts', label: 'Alerts', icon: 'Bell' },
    ],
    // per-client pages light up Clients too
    also: ['/coach/day/', '/coach/logs/', '/coach/review/', '/coach/body/', '/coach/health/', '/coach/nutrition/', '/coach/print/'],
  },
  {
    key: 'index', label: 'Index', to: '/coach/library',
    items: [
      { to: '/coach/library', label: 'Exercises', icon: 'Library' },
      { to: '/coach/programs', label: 'Programs', icon: 'ClipboardList' },
      { to: '/coach/templates', label: 'Templates & tracks', icon: 'Copy' },
      { to: '/coach/forms', label: 'Forms', icon: 'ListChecks' },
      { to: '/coach/intake-forms', label: 'Intake forms', icon: 'FileCheck2' },
      { to: '/coach/hub', label: 'Client hub', icon: 'BookOpen' },
      { to: '/coach/resources', label: 'Documents', icon: 'FileText' },
      { to: '/coach/roadmap', label: 'Roadmap', icon: 'Map' },
    ],
  },
  { key: 'business', label: 'Business', to: '/coach/business',
    items: [
      { to: '/coach/business', label: 'Overview', icon: 'Gauge', end: true },
      { to: '/coach/pipeline', label: 'Pipeline', icon: 'Target' },
      { to: '/coach/contracts', label: 'Contracts', icon: 'ClipboardSignature' },
      { to: '/coach/testimonials', label: 'Testimonials', icon: 'Quote' },
    ],
  },
  // CoachRx's PROGRAMS tab opens the Index with Programs picked: same menu
  { key: 'programs', label: 'Programs', to: '/coach/programs', menuOf: 'index' },
  { key: 'coaches', label: 'Coaches', to: '/coach/team', head: true, items: [{ to: '/coach/team', label: 'Team', icon: 'UserCog' }] },
]

const matches = (path, to, end) => (end ? path === to : path === to || path.startsWith(to + '/'))

// Which top tab is lit for a path. Programs beats Index for /coach/programs.
export function sectionFor(path) {
  const p = String(path || '').replace(/\/+$/, '') || '/coach'
  if (p === '/coach') return 'dashboard'
  if (matches(p, '/coach/programs')) return 'programs'
  for (const s of SECTIONS) {
    if (s.key === 'dashboard' || s.key === 'programs') continue
    if ((s.items || []).some(i => matches(p, i.to)) || (s.also || []).some(a => p.startsWith(a))) return s.key
  }
  return 'dashboard'   // settings, problems, etc. live under the avatar menu
}

// The left-hand menu for a path ([] for the Dashboard).
export function menuFor(path, isHeadCoach = false) {
  const key = sectionFor(path)
  const s = SECTIONS.find(x => x.key === key)
  if (!s || (s.head && !isHeadCoach)) return []
  return SECTIONS.find(x => x.key === (s.menuOf || s.key)).items || []
}

// Top tabs for this coach, each with the total waiting across its menu.
export function topTabs(isHeadCoach, badges = {}) {
  return SECTIONS.filter(s => !s.head || isHeadCoach).map(s => {
    const items = s.menuOf ? [] : s.items || []
    return { ...s, waiting: items.reduce((n, i) => n + (i.badge ? Number(badges[i.badge]) || 0 : 0), 0) }
  })
}

// "a day ago", "6 days ago" for the dropdowns
export function ago(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24); if (d === 1) return 'a day ago'
  if (d < 30) return `${d} days ago`
  const mo = Math.round(d / 30); return `${mo} month${mo === 1 ? '' : 's'} ago`
}

// Latest message per conversation partner, for the chat dropdown.
export function latestThreads(messages, me, limit = 6) {
  const by = new Map()
  for (const m of [...(messages || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    const other = m.sender_id === me ? m.recipient_id : m.sender_id
    if (!other || by.has(other)) continue
    by.set(other, { other, last: m, unread: (messages || []).some(x => x.sender_id === other && x.recipient_id === me && !x.read_at) })
  }
  return [...by.values()].slice(0, limit)
}
