// Workout sets that couldn't reach the server (bad gym signal, phone asleep
// mid-save) are kept on the phone and sent again later, instead of quietly
// vanishing (Update 165).
//
// Each pending row is keyed the same way the database is
// (client_id, exercise_id, set_number, logged_date), so a newer edit to the
// same set replaces the older pending one and nothing is ever sent twice.
// The upsert is idempotent, so a retry that races a late success is harmless.

const UPSERT_KEY = 'client_id,exercise_id,set_number,logged_date'
const storeKey = uid => `ws-pending-sets:${uid}`
export const rowKey = r => `${r.client_id}|${r.exercise_id}|${r.set_number}|${r.logged_date}`

function storage() {
  try { return globalThis.localStorage || null } catch { return null }
}
export function readPending(uid) {
  const ls = storage()
  if (!ls || !uid) return []
  try { const v = JSON.parse(ls.getItem(storeKey(uid)) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function writePending(uid, rows) {
  const ls = storage()
  if (!ls || !uid) return
  try { rows.length ? ls.setItem(storeKey(uid), JSON.stringify(rows)) : ls.removeItem(storeKey(uid)) } catch { /* storage full or blocked */ }
}
function addPending(uid, row) {
  const k = rowKey(row)
  writePending(uid, [...readPending(uid).filter(r => rowKey(r) !== k), { ...row, queued_at: new Date().toISOString() }])
}
function dropPending(uid, row) {
  const k = rowKey(row)
  const left = readPending(uid).filter(r => rowKey(r) !== k)
  writePending(uid, left)
  return left
}

async function upsert(sb, rows) {
  try {
    const { error } = await sb.from('workout_logs').upsert(rows.map(({ queued_at, ...r }) => r), { onConflict: UPSERT_KEY })
    return error ? { ok: false, error } : { ok: true }
  } catch (error) {
    return { ok: false, error } // network failures can throw instead of returning
  }
}

// Save one set. On failure it's queued and { ok:false } comes back so the
// screen can show it as not saved yet. A success also clears any older
// queued copy of the same set.
export async function saveSet(sb, row) {
  const res = await upsert(sb, [row])
  if (res.ok) dropPending(row.client_id, row)
  else addPending(row.client_id, row)
  return res
}

// Try everything still waiting. Returns how many are left.
let flushing = null
export function flushPending(sb, uid) {
  if (flushing) return flushing
  flushing = (async () => {
    const rows = readPending(uid)
    for (const r of rows) {
      const res = await upsert(sb, [r])
      if (res.ok) dropPending(uid, r)
    }
    return readPending(uid).length
  })().finally(() => { flushing = null })
  return flushing
}

// Today's saved sets with anything still waiting on the phone laid over the
// top (the phone copy is newer), so reopening the workout offline or after a
// refresh still shows what they typed.
export function withPending(serverRows, pendingRows) {
  const k = r => `${r.exercise_id}|${r.set_number}`
  const out = new Map((serverRows || []).map(r => [k(r), r]))
  for (const p of pendingRows || []) out.set(k(p), { ...(out.get(k(p)) || {}), ...p })
  return [...out.values()]
}
