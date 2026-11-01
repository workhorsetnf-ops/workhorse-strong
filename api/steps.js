// Steps (Update 143) and food totals (Update 156) from an iPhone Shortcut.
//   POST /api/steps?t=<client's private token>
//   body: { "steps": 8532, "protein": 190, "carbs": 221.5, "fat": 64, "fiber": 31, "date": "2026-10-28" }
//   Every field is optional, but there must be steps or at least one macro.
//   date defaults to today Eastern.
// Shortcuts sometimes sends numbers as text ("8,532" or "8532.0"), so both are accepted.
// The token is the only credential: it identifies one person (client or coach)
// and can only write their own steps and food totals. Rotating it on the setup page kills the old link.
//
// Food comes from Apple Health, so it works with whatever app writes nutrition
// there (MyFitnessPal, Cronometer, MacroFactor...). It is saved as that day's
// "Daily totals" row, which counts as the whole day (see src/lib/foodlog.js).
import { admin } from './_push.js'

const TZ = process.env.COACH_TIMEZONE || 'America/New_York'
const dayIn = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export function parseSteps(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null
  const m = String(v ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/)
  return m ? Math.round(Number(m[0])) : null
}

// Grams of a macro. Health can hand over a list of samples (one per meal) when
// "Group by Day" is missed; as an array or one-per-line text they're added up.
export function parseGrams(v) {
  if (v === null || v === undefined || v === '') return null
  if (Array.isArray(v)) { const xs = v.map(parseGrams).filter(x => x !== null); return xs.length ? round1(xs.reduce((a, b) => a + b, 0)) : null }
  if (typeof v === 'number') return Number.isFinite(v) ? round1(v) : null
  const xs = String(v).split(/[\n\r]+/).map(line => line.replace(/,/g, '').match(/-?\d+(\.\d+)?/)).filter(Boolean).map(m => Number(m[0]))
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0)) : null
}
const round1 = n => Math.round(n * 10) / 10

// The day's macros from the body, or null when there's nothing worth saving.
// All-zero means nothing was logged in Health that day: saving it would hide the
// client's in-app meals behind an empty "Daily totals" row, so it's skipped.
export function pickFood(body) {
  const g = k => parseGrams(body[k] ?? body[k[0].toUpperCase() + k.slice(1)])
  const f = { p: g('protein'), c: g('carbs') ?? g('carbohydrates'), fat: g('fat'), fi: g('fiber') }
  if ([f.p, f.c, f.fat].every(x => x === null)) return null
  for (const k of ['p', 'c', 'fat', 'fi']) if (f[k] !== null && (f[k] < 0 || f[k] > 2000)) return { bad: true }
  if (!(f.p > 0 || f.c > 0 || f.fat > 0)) return { empty: true }
  return { protein_g: Math.round(f.p || 0), carbs_g: Math.round(f.c || 0), fat_g: Math.round(f.fat || 0), fiber_g: f.fi === null ? 0 : Math.round(f.fi) }
}

export const DAILY_TOTALS = 'Daily totals'   // same value as src/lib/foodlog.js
export const HEALTH_NAME = 'From Apple Health'

// One "Daily totals" row per client per day: update it if there is one (tidying
// any duplicates), otherwise add it.
export async function saveFood(sb, clientId, date, vals) {
  const { data: rows, error: qErr } = await sb.from('meal_logs').select('id').eq('client_id', clientId)
    .eq('logged_on', date).eq('meal', DAILY_TOTALS).order('logged_at', { ascending: true })
  if (qErr) return qErr
  const row = { ...vals, meal_name: HEALTH_NAME, logged_at: new Date().toISOString() }
  if (rows?.length) {
    const { error } = await sb.from('meal_logs').update(row).eq('id', rows[0].id)
    if (error) return error
    if (rows.length > 1) await sb.from('meal_logs').delete().in('id', rows.slice(1).map(r => r.id))
    return null
  }
  const { error } = await sb.from('meal_logs').insert({ client_id: clientId, logged_on: date, meal: DAILY_TOTALS, ...row })
  return error
}

// Accept yyyy-MM-dd, or anything Date can read; only today or the 3 days before.
export function pickDate(raw, now = new Date()) {
  const today = dayIn(now)
  if (!raw) return today
  let d = String(raw).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { const p = new Date(d.replace(/\s+at\s+/i, ' ')); if (isNaN(p)) return null; d = dayIn(p) }
  const diff = (Date.parse(today) - Date.parse(d)) / 864e5
  return diff >= 0 && diff <= 3 ? d : null
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const token = String(req.query?.t || req.headers['x-steps-token'] || '').trim()
  if (!/^[a-f0-9]{24,64}$/.test(token)) return res.status(401).json({ error: 'Missing or bad link. Copy your link again from the app.' })
  let body = req.body || {}
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = { steps: body } } }
  const rawSteps = body.steps ?? body.Steps ?? body.value
  const steps = rawSteps === undefined || rawSteps === '' ? null : parseSteps(rawSteps)
  if (steps !== null && (steps < 0 || steps > 150000)) return res.status(400).json({ error: 'That step count looks wrong.' })
  const food = pickFood(body)
  if (food?.bad) return res.status(400).json({ error: 'Those food numbers look wrong. Check the protein, carbs and fat fields are grams.' })
  const hasFood = food && !food.empty
  if (steps === null && !hasFood) {
    return res.status(400).json({ error: food?.empty ? 'Apple Health has no food logged for today yet. Nothing was changed.' : 'No step count or food totals found.' })
  }
  const date = pickDate(body.date)
  if (!date) return res.status(400).json({ error: 'Date must be today or up to 3 days ago.' })
  try {
    const sb = admin()
    const { data: row, error: qErr } = await sb.from('steps_tokens').select('user_id').eq('token', token).maybeSingle()
    if (qErr) return res.status(500).json({ error: `Server could not check the link: ${qErr.message}` })
    const who = row ? { id: row.user_id } : null
    if (!who) return res.status(401).json({ error: 'This link is not active (it was replaced or never saved). Open Sync from Apple Health in the app, tap Copy link, and paste it into the Shortcut again.' })
    const saved = []
    if (steps !== null) {
      const { error } = await sb.from('daily_logs').upsert(
        { client_id: who.id, log_date: date, steps, steps_source: 'shortcut', steps_synced_at: new Date().toISOString() },
        { onConflict: 'client_id,log_date' })
      if (error) return res.status(500).json({ error: error.message })
      saved.push(`${steps.toLocaleString('en-US')} steps`)
    }
    if (hasFood) {
      const error = await saveFood(sb, who.id, date, food)
      if (error) return res.status(500).json({ error: `${steps !== null ? 'Steps saved, but food' : 'Food'} could not be saved: ${error.message}` })
      const kcal = food.protein_g * 4 + food.carbs_g * 4 + food.fat_g * 9
      saved.push(`food ${kcal.toLocaleString('en-US')} kcal (${food.protein_g}P / ${food.carbs_g}C / ${food.fat_g}F)`)
    }
    const note = food?.empty ? ' No food in Apple Health yet today, so food was left alone.' : ''
    res.json({ ok: true, date, steps, food: hasFood ? food : null, message: `Saved ${saved.join(' and ')} for ${date}.${note}` })
  } catch (e) { res.status(500).json({ error: e.message }) }
}
