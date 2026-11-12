// Coach + assistant accounts (Update 179).
//
// An assistant (VA) has their own login and can do everything the coach can,
// except create or change programs and the libraries that programs are built
// from. The database enforces that; this file just keeps the app honest about
// it (view-only screens, a clear message instead of a silent failure).

// Tables an assistant can view but never change. Keep in step with the
// trigger list in migration_update179_assistant_role.sql.
export const PROGRAM_TABLES = [
  'programs', 'program_blocks', 'program_days', 'program_exercises', 'program_rotations',
  'exercise_library', 'exercise_alternatives', 'conditioning_library', 'lifestyle_library', 'routine_library',
]

export const VIEW_ONLY_MESSAGE = 'View only: assistants can’t create or change programs or the library.'

// Who the signed-in person is, as far as the coach side is concerned.
//   inboxId: the account messages are read from and sent as (an assistant
//            works the coach's inbox, so clients keep one "Coach" thread)
export function teamInfo(profile, coachId) {
  const role = profile?.role
  const isHeadCoach = role === 'coach'
  const isAssistant = role === 'assistant'
  const active = isHeadCoach || (isAssistant && (profile?.status || 'active') === 'active')
  return {
    isHeadCoach,
    isAssistant,
    isStaff: active,
    assistantOff: isAssistant && !active,
    inboxId: isAssistant ? (coachId || null) : (profile?.id || null),
    programsLocked: isAssistant,
  }
}

// A stand-in for a refused write: it can be chained like a normal query
// (.eq().select().single()...) and resolves to an error, never touching the DB.
function refused(onBlocked) {
  const result = { data: null, error: { message: VIEW_ONLY_MESSAGE, code: '42501' }, count: null, status: 403 }
  let told = false
  const tell = () => { if (!told) { told = true; onBlocked?.(VIEW_ONLY_MESSAGE) } }
  const chain = new Proxy(function () {}, {
    get(_, key) {
      if (key === 'then') return (ok, bad) => { tell(); return Promise.resolve(result).then(ok, bad) }
      if (key === 'catch' || key === 'finally') return (fn) => { tell(); return Promise.resolve(result)[key](fn) }
      return () => chain
    },
    apply() { return chain },
  })
  return chain
}

// Wraps client.from() so program/library writes are refused up front while
// `isLocked()` is true. Reads are untouched.
export function guardProgramWrites(client, isLocked, onBlocked) {
  if (client.__programGuard) return client
  const rawFrom = client.from.bind(client)
  client.from = (table) => {
    const q = rawFrom(table)
    if (!isLocked() || !PROGRAM_TABLES.includes(table)) return q
    for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => refused(onBlocked)
    return q
  }
  client.__programGuard = true
  return client
}
