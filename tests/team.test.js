// Assistant (VA) accounts (Update 179): who counts as staff, the view-only
// program guard in the app, and the head-coach-only Team endpoint.
// The real enforcement is in the database (migration_update179_assistant_role.sql),
// tested separately against Postgres; these cover the app and server side.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { makeSb } from './helpers/fakeSupabase.js'
import { teamInfo, guardProgramWrites, PROGRAM_TABLES, VIEW_ONLY_MESSAGE } from '../src/lib/team.js'
import { actingProfile, staffIds } from '../api/_push.js'
import { runTeam } from '../api/team.js'

const COACH = { id: 'coach', role: 'coach', full_name: 'Anthony Henry', status: 'active', created_at: '2025-01-01' }
const VA = { id: 'va', role: 'assistant', full_name: 'Vee Assist', status: 'active', created_at: '2026-11-01' }
const OLD_VA = { id: 'oldva', role: 'assistant', full_name: 'Old VA', status: 'exited', created_at: '2026-06-01' }
const CLIENT = { id: 'c1', role: 'client', full_name: 'Client One', status: 'active', created_at: '2026-02-01' }

// ---------- who is who
test('coach: staff, own inbox, programs open', () => {
  assert.deepEqual(teamInfo(COACH, null), { isHeadCoach: true, isAssistant: false, isStaff: true, assistantOff: false, inboxId: 'coach', programsLocked: false })
})
test('active assistant: staff, works the coach inbox, programs locked', () => {
  const t = teamInfo(VA, 'coach')
  assert.equal(t.isStaff, true); assert.equal(t.isHeadCoach, false); assert.equal(t.inboxId, 'coach'); assert.equal(t.programsLocked, true)
})
test('deactivated assistant: not staff, shown the access-off screen', () => {
  const t = teamInfo(OLD_VA, 'coach')
  assert.equal(t.isStaff, false); assert.equal(t.assistantOff, true)
})
test('client: not staff, not locked', () => {
  const t = teamInfo(CLIENT, null)
  assert.equal(t.isStaff, false); assert.equal(t.assistantOff, false); assert.equal(t.programsLocked, false)
})
test('no profile yet: nothing', () => assert.equal(teamInfo(null, null).isStaff, false))

// ---------- the in-app view-only guard
function fakeClient() {
  const calls = []
  const builder = (table) => {
    const q = {}
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'single']) q[m] = (...a) => { calls.push([table, m]); return q }
    q.then = (ok) => Promise.resolve({ data: [{ table }], error: null }).then(ok)
    return q
  }
  return { client: { from: builder }, calls }
}
test('locked: every program/library write is refused before reaching the database', async () => {
  const { client, calls } = fakeClient()
  const told = []
  guardProgramWrites(client, () => true, m => told.push(m))
  for (const t of PROGRAM_TABLES) {
    for (const m of ['insert', 'update', 'upsert', 'delete']) {
      const r = await client.from(t)[m]({ x: 1 }).eq('id', '1').select().single()
      assert.equal(r.error.message, VIEW_ONLY_MESSAGE, `${t}.${m}`)
      assert.equal(r.data, null)
    }
  }
  assert.equal(calls.filter(c => ['insert', 'update', 'upsert', 'delete'].includes(c[1])).length, 0, 'nothing sent')
  assert.ok(told.length > 0, 'the assistant is told why')
})
test('locked: reads still work, and other tables are untouched', async () => {
  const { client } = fakeClient()
  guardProgramWrites(client, () => true, () => {})
  assert.deepEqual((await client.from('programs').select('*')).data, [{ table: 'programs' }])
  assert.equal((await client.from('messages').insert({ body: 'hi' })).error, null)
  assert.equal((await client.from('program_assignments').update({ current_week: 2 }).eq('id', 'a')).error, null, 'assigning stays open')
  assert.equal((await client.from('food_library').insert({ name: 'Rice' })).error, null, 'foods stay open')
})
test('unlocked (the coach): writes go through', async () => {
  const { client } = fakeClient()
  guardProgramWrites(client, () => false, () => {})
  assert.equal((await client.from('programs').insert({ name: 'x' })).error, null)
})
test('the guard follows the lock as it changes (sign out / sign in)', async () => {
  const { client } = fakeClient()
  let locked = false
  guardProgramWrites(client, () => locked, () => {})
  assert.equal((await client.from('program_exercises').update({ reps: '5' })).error, null)
  locked = true
  assert.ok((await client.from('program_exercises').update({ reps: '5' })).error)
})
test('the app list matches the tables the migration locks', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../migration_update179_assistant_role.sql', import.meta.url), 'utf8')
  const list = sql.match(/foreach t in array array\[([\s\S]*?)\]\s*loop\s*if to_regclass[\s\S]*?assistant_view_only/)[1]
  const tables = [...list.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  assert.deepEqual([...tables].sort(), [...PROGRAM_TABLES].sort())
})

// ---------- server: assistants act as the coach
test('active assistant acts as the coach, with who really asked', async () => {
  const sb = makeSb({ profiles: [COACH, VA, OLD_VA, CLIENT] })
  const me = await actingProfile(sb, VA)
  assert.equal(me.id, 'coach'); assert.equal(me.role, 'coach'); assert.deepEqual(me.actor, { id: 'va', role: 'assistant', full_name: 'Vee Assist' })
})
test('deactivated assistant gets nothing; coach and clients unchanged', async () => {
  const sb = makeSb({ profiles: [COACH, VA, OLD_VA, CLIENT] })
  assert.equal(await actingProfile(sb, OLD_VA), null)
  assert.equal(await actingProfile(sb, COACH), COACH)
  assert.equal(await actingProfile(sb, CLIENT), CLIENT)
})
test('coach-side notifications reach the coach and active assistants only', async () => {
  const sb = makeSb({ profiles: [COACH, VA, OLD_VA, CLIENT] })
  assert.deepEqual((await staffIds(sb)).sort(), ['coach', 'va'])
})

// ---------- server: Team endpoint
function teamSb() {
  const sb = makeSb({ profiles: [{ ...COACH }, { ...VA }, { ...OLD_VA }, { ...CLIENT }] })
  const authCalls = []
  sb.auth = { admin: {
    createUser: async ({ email, user_metadata }) => {
      if (sb.db.profiles.some(p => p.email === email)) return { data: null, error: { message: 'User already registered' } }
      const id = 'new-' + sb.db.profiles.length
      sb.db.profiles.push({ id, full_name: user_metadata.full_name, email, role: 'client', status: 'active' })   // the sign-up trigger
      return { data: { user: { id } }, error: null }
    },
    updateUserById: async (id, attrs) => { authCalls.push([id, attrs]); return { data: {}, error: null } },
  } }
  return { sb, authCalls }
}
const asCoach = { ...COACH }
const asVa = { ...COACH, actor: { id: 'va', role: 'assistant' } }

test('only the head coach manages the team', async () => {
  const { sb } = teamSb()
  for (const me of [null, asVa, CLIENT]) assert.equal((await runTeam(sb, me, { action: 'list' })).status, 403)
  assert.equal((await runTeam(sb, asVa, { action: 'reactivate', id: 'oldva' })).status, 403, 'an assistant can\'t switch a teammate back on')
})
test('list shows assistants only', async () => {
  const { sb } = teamSb()
  const r = await runTeam(sb, asCoach, { action: 'list' })
  assert.deepEqual(r.json.team.map(m => m.id).sort(), ['oldva', 'va'])
})
test('add creates an active assistant login', async () => {
  const { sb } = teamSb()
  const r = await runTeam(sb, asCoach, { action: 'add', full_name: 'Sam Helper', email: 'Sam@Help.com', password: 'Workhorse-AB12' })
  assert.equal(r.status, 200)
  const p = sb.db.profiles.find(x => x.id === r.json.id)
  assert.equal(p.role, 'assistant'); assert.equal(p.status, 'active'); assert.equal(p.email, 'sam@help.com')
})
test('add rejects a short password, a bad email, and an existing account', async () => {
  const { sb } = teamSb()
  assert.equal((await runTeam(sb, asCoach, { action: 'add', full_name: 'Sam', email: 'sam@help.com', password: 'short' })).status, 400)
  assert.equal((await runTeam(sb, asCoach, { action: 'add', full_name: 'Sam', email: 'nope', password: 'longenough1' })).status, 400)
  sb.db.profiles.push({ id: 'x', email: 'taken@x.com', role: 'client' })
  assert.equal((await runTeam(sb, asCoach, { action: 'add', full_name: 'Sam', email: 'taken@x.com', password: 'longenough1' })).status, 409)
})
test('deactivate cuts access and blocks sign-in; reactivate restores both', async () => {
  const { sb, authCalls } = teamSb()
  assert.equal((await runTeam(sb, asCoach, { action: 'deactivate', id: 'va' })).status, 200)
  assert.equal(sb.db.profiles.find(p => p.id === 'va').status, 'exited')
  assert.deepEqual(authCalls.at(-1), ['va', { ban_duration: '876000h' }])
  assert.equal((await runTeam(sb, asCoach, { action: 'reactivate', id: 'va' })).status, 200)
  assert.equal(sb.db.profiles.find(p => p.id === 'va').status, 'active')
  assert.deepEqual(authCalls.at(-1), ['va', { ban_duration: 'none' }])
})
test('team actions never touch the coach or a client', async () => {
  const { sb, authCalls } = teamSb()
  for (const id of ['coach', 'c1', 'missing']) {
    for (const action of ['deactivate', 'reactivate', 'password']) {
      assert.equal((await runTeam(sb, asCoach, { action, id, password: 'longenough1' })).status, 404, `${action} ${id}`)
    }
  }
  assert.equal(authCalls.length, 0)
  assert.equal(sb.db.profiles.find(p => p.id === 'c1').status, 'active')
})
test('password reset needs 8+ characters', async () => {
  const { sb, authCalls } = teamSb()
  assert.equal((await runTeam(sb, asCoach, { action: 'password', id: 'va', password: 'short' })).status, 400)
  assert.equal((await runTeam(sb, asCoach, { action: 'password', id: 'va', password: 'Workhorse-ZZ99' })).status, 200)
  assert.deepEqual(authCalls, [['va', { password: 'Workhorse-ZZ99' }]])
})
