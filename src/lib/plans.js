// Copy plans between clients, save them as templates, and apply tracks.
// A "snapshot" is plain JSON with no ids, so it can live in a template or go
// straight onto other clients.
import { scaleToTargets, targetsFrom } from './mealplan'

export const KINDS = {
  meal_plan: 'Meal plan',
  habits: 'Habits',
  supplements: 'Supplements',
  cardio: 'Cardio plan',
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]))
const ITEM_KEYS = ['food_id', 'food_name', 'category', 'grams', 'protein100', 'carbs100', 'fat100', 'fiber100', 'note', 'position']
const SUPP_KEYS = ['name', 'dose', 'timing', 'purpose', 'monthly_cost', 'notes', 'position']
const CARDIO_KEYS = ['weekday', 'cardio_type', 'minutes', 'zone', 'notes']

export async function snapshot(sb, clientId, kind) {
  if (kind === 'meal_plan') {
    const [{ data: plan }, { data: meals }, { data: items }] = await Promise.all([
      sb.from('meal_plans').select('*').eq('client_id', clientId).maybeSingle(),
      sb.from('meal_plan_meals').select('*').eq('client_id', clientId).order('position'),
      sb.from('meal_plan_items').select('*').eq('client_id', clientId).order('position'),
    ])
    return {
      fiber_target: plan?.fiber_target ?? 35, notes: plan?.notes || '',
      meals: (meals || []).map(m => ({ label: m.label, swap: m.swap || '', position: m.position, items: (items || []).filter(i => i.meal_id === m.id).map(i => pick(i, ITEM_KEYS)) })),
    }
  }
  if (kind === 'habits') {
    const { data } = await sb.from('client_habits').select('*').eq('client_id', clientId).eq('active', true).order('position')
    return { habits: (data || []).map(h => ({ name: h.name, target: h.target || '', position: h.position })) }
  }
  if (kind === 'supplements') {
    const { data } = await sb.from('client_supplements').select('*').eq('client_id', clientId).eq('active', true).order('position')
    return { supplements: (data || []).map(s => pick(s, SUPP_KEYS)) }
  }
  if (kind === 'cardio') {
    const [{ data: plan }, { data: settings }] = await Promise.all([
      sb.from('client_cardio_plan').select('*').eq('client_id', clientId),
      sb.from('client_cardio_settings').select('*').eq('client_id', clientId).maybeSingle(),
    ])
    return { plan: (plan || []).map(r => pick(r, CARDIO_KEYS)), zone2_target: settings?.zone2_target ?? null, hiit_target: settings?.hiit_target ?? null }
  }
  throw new Error('Unknown kind ' + kind)
}

export const isEmptySnap = (kind, s) => !s || (kind === 'meal_plan' ? !s.meals?.length : kind === 'habits' ? !s.habits?.length : kind === 'supplements' ? !s.supplements?.length : !s.plan?.length)

export function snapSummary(kind, s) {
  if (!s) return ''
  if (kind === 'meal_plan') return `${s.meals.length} meals · ${s.meals.reduce((a, m) => a + m.items.length, 0)} foods`
  if (kind === 'habits') return s.habits.map(h => h.name).join(', ')
  if (kind === 'supplements') return s.supplements.map(x => x.name).join(', ')
  if (kind === 'cardio') return `${s.plan.length} days · ${s.plan.reduce((a, r) => a + (Number(r.minutes) || 0), 0)} min/week`
  return ''
}

// Put a snapshot onto a client.
// Meal plan and cardio plan REPLACE what the client had (nothing is logged against them).
// Habits and supplements MERGE by name, so the client's tick history is never deleted.
// opts.scale: scale the meal plan's grams to this client's own macro targets.
export async function applySnapshot(sb, clientId, kind, snap, opts = {}) {
  if (kind === 'meal_plan') {
    let lines = snap.meals.flatMap((m, mi) => m.items.map(i => ({ ...i, _meal: mi })))
    if (opts.scale) {
      const [{ data: prof }] = await Promise.all([sb.from('profiles').select('protein_g, carbs_g, fat_g, calories').eq('id', clientId).single()])
      const t = targetsFrom(prof, { fiber_target: snap.fiber_target })
      if (t.p && t.c && t.f) lines = scaleToTargets(lines, t)
    }
    await sb.from('meal_plan_meals').delete().eq('client_id', clientId)        // items cascade
    await sb.from('meal_plans').upsert({ client_id: clientId, fiber_target: snap.fiber_target ?? 35, notes: snap.notes || '', updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
    for (let mi = 0; mi < snap.meals.length; mi++) {
      const m = snap.meals[mi]
      const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `m${Date.now()}${mi}`
      await sb.from('meal_plan_meals').insert({ id, client_id: clientId, label: m.label, swap: m.swap || '', position: m.position ?? mi })
      const rows = lines.filter(l => l._meal === mi).map(({ _meal, ...l }) => ({ ...l, meal_id: id, client_id: clientId }))
      if (rows.length) await sb.from('meal_plan_items').insert(rows)
    }
    return { added: snap.meals.length }
  }
  if (kind === 'habits') {
    const { data: cur } = await sb.from('client_habits').select('*').eq('client_id', clientId)
    const have = new Map((cur || []).map(h => [h.name.trim().toLowerCase(), h]))
    let added = 0, n = (cur || []).filter(h => h.active).length
    for (const h of snap.habits) {
      const ex = have.get(h.name.trim().toLowerCase())
      if (ex) { if (!ex.active || (h.target && h.target !== ex.target)) await sb.from('client_habits').update({ active: true, target: h.target || ex.target }).eq('id', ex.id); continue }
      await sb.from('client_habits').insert({ client_id: clientId, name: h.name, target: h.target || '', position: n++ })
      added++
    }
    return { added }
  }
  if (kind === 'supplements') {
    const { data: cur } = await sb.from('client_supplements').select('*').eq('client_id', clientId)
    const have = new Map((cur || []).map(s => [s.name.trim().toLowerCase(), s]))
    let added = 0, n = (cur || []).filter(s => s.active).length
    for (const s of snap.supplements) {
      const ex = have.get(s.name.trim().toLowerCase())
      if (ex) { await sb.from('client_supplements').update({ ...pick(s, ['dose', 'timing', 'purpose', 'monthly_cost', 'notes']), active: true }).eq('id', ex.id); continue }
      await sb.from('client_supplements').insert({ ...pick(s, SUPP_KEYS), client_id: clientId, position: n++, active: true })
      added++
    }
    return { added }
  }
  if (kind === 'cardio') {
    await sb.from('client_cardio_plan').delete().eq('client_id', clientId)
    if (snap.plan.length) await sb.from('client_cardio_plan').insert(snap.plan.map(r => ({ ...r, client_id: clientId })))
    if (snap.zone2_target != null || snap.hiit_target != null) {
      await sb.from('client_cardio_settings').upsert({ client_id: clientId, ...(snap.zone2_target != null ? { zone2_target: snap.zone2_target } : {}), ...(snap.hiit_target != null ? { hiit_target: snap.hiit_target } : {}) }, { onConflict: 'client_id' })
    }
    return { added: snap.plan.length }
  }
  throw new Error('Unknown kind ' + kind)
}

// Give a client a program, starting on startDate at week 1 of its first block.
export async function assignProgram(sb, clientId, programId, startDate) {
  const { data: bs } = await sb.from('program_blocks').select('id').eq('program_id', programId).order('position')
  return sb.from('program_assignments').upsert({ program_id: programId, client_id: clientId, current_week: 1, current_block_id: bs?.[0]?.id || null, start_date: startDate }, { onConflict: 'client_id' })
}

// Everything a track holds, onto one client.
export async function applyTrack(sb, clientId, track, templatesById, startDate) {
  const done = []
  if (track.program_id) { await assignProgram(sb, clientId, track.program_id, startDate); done.push('program') }
  for (const [kind, col] of [['meal_plan', 'meal_template_id'], ['habits', 'habits_template_id'], ['supplements', 'supps_template_id'], ['cardio', 'cardio_template_id']]) {
    const t = track[col] && templatesById[track[col]]
    if (t) { await applySnapshot(sb, clientId, kind, t.data, { scale: kind === 'meal_plan' && track.scale_meals !== false }); done.push(kind) }
  }
  await sb.from('profiles').update({ track_id: track.id }).eq('id', clientId)
  return done
}
