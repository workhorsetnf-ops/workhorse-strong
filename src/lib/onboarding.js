// Hands-free onboarding (Update 184): where a new client is.
//   setup    -> paid, hasn't opened their setup link yet
//   contract -> signed in, contract not signed (the app shows only the contract)
//   forms    -> signed, onboarding forms still to fill in
//   call     -> forms done, onboarding call not booked
//   done     -> call booked (or held)
// Shared by the client screens, the coach list and the server.
export const STAGES = ['setup', 'contract', 'forms', 'call', 'done']
export const STAGE_LABELS = {
  setup: 'Hasn’t set up account',
  contract: 'Contract not signed',
  forms: 'Filling in forms',
  call: 'Needs to book call',
  done: 'Onboarding call booked',
}

export function onboardingStage({ profile, contracts = [], assignments = [], bookings = [], callTypeId = null, setupDone = true }) {
  if (!profile?.onboarding_started_at) return null
  if (!setupDone) return 'setup'
  if (contracts.some(c => c.status === 'sent')) return 'contract'
  if (assignments.some(a => a.status === 'pending')) return 'forms'
  const since = new Date(profile.onboarding_started_at)
  const booked = bookings.some(b => (b.status === 'booked' || b.status === 'completed')
    && (callTypeId ? b.call_type_id === callTypeId : new Date(b.created_at || b.starts_at) >= since))
  return booked ? 'done' : 'call'
}

// Group open slots by the coach's local day, for the picker.
export function slotsByDay(slots, timeZone = 'America/New_York') {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const out = []
  for (const s of slots || []) {
    const day = fmt.format(new Date(s.starts_at))
    let g = out.find(x => x.day === day)
    if (!g) out.push(g = { day, slots: [] })
    g.slots.push(s)
  }
  return out
}
